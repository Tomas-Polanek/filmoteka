import SwiftUI
import Supabase

/// Step 1: pick a film/series via TMDB search (skipped when `prefill` is given). Step 2: fill in the viewing.
struct AddViewingView: View {
    private static let places = [
        "Jellyfin", "Netflix", "HBO Max", "Disney+", "Prime Video",
        "Apple TV+", "SkyShowtime", "Kino", "TV", "Jiné",
    ]
    private static let other = "Jiné"

    @Environment(\.dismiss) private var dismiss
    @State private var item: TMDBItem?

    @State private var query = ""
    @State private var results: [TMDBItem] = []
    @State private var searchError: String?

    @State private var date = Date()
    @State private var monthOnly = false
    @State private var place = AddViewingView.places[0]
    @State private var customPlace = ""
    @State private var rate = false
    @State private var rating = 7
    @State private var note = ""
    @State private var saving = false
    @State private var saveError: String?

    init(prefill: TMDBItem? = nil) {
        _item = State(initialValue: prefill)
    }

    var body: some View {
        NavigationStack {
            Group {
                if let item { form(for: item) } else { searchStep }
            }
            .navigationTitle(item == nil ? "Vybrat titul" : "Zhlédnutí")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zrušit") { dismiss() }
                }
            }
        }
    }

    // MARK: Step 1

    private var searchStep: some View {
        List {
            if let searchError {
                Text(searchError).foregroundStyle(.red)
            }
            ForEach(results) { r in
                Button { item = r } label: {
                    HStack(spacing: 12) {
                        PosterView(path: r.posterPath, size: "w92").frame(width: 40)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.title).font(.headline)
                            Text(subtitle(r)).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
            TMDBAttribution()
        }
        .searchable(
            text: $query, placement: .navigationBarDrawer(displayMode: .always),
            prompt: "Hledat film nebo seriál"
        )
        .task(id: query) { await runSearch() }
    }

    private func subtitle(_ r: TMDBItem) -> String {
        let kind = r.mediaType == "tv" ? "Seriál" : "Film"
        return r.releaseYear.map { "\(kind) · \($0)" } ?? kind
    }

    /// Debounced by .task(id:): a new query cancels this task, so only the last keystroke survives the sleep.
    private func runSearch() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else {
            results = []
            searchError = nil
            return
        }
        do {
            try await Task.sleep(for: .milliseconds(400))
            let found = try await TMDB.search(q)
            // URLSession may still deliver after cancellation; never let an outdated query overwrite newer state.
            guard !Task.isCancelled else { return }
            results = found
            searchError = nil
        } catch is CancellationError {
        } catch {
            if !Task.isCancelled { searchError = error.localizedDescription }
        }
    }

    // MARK: Step 2

    private func form(for item: TMDBItem) -> some View {
        Form {
            Section {
                HStack(spacing: 12) {
                    PosterView(path: item.posterPath, size: "w92").frame(width: 50)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.title).font(.headline)
                        Text(subtitle(item)).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            }

            Section("Kdy") {
                DatePicker("Datum", selection: $date, in: ...Date(), displayedComponents: .date)
                Toggle("Jen měsíc", isOn: $monthOnly)
                if monthOnly {
                    LabeledContent("Uloží se jako", value: DateOnly.month(date))
                }
            }

            Section("Kde") {
                Picker("Kde", selection: $place) {
                    ForEach(Self.places, id: \.self) { Text($0).tag($0) }
                }
                if place == Self.other {
                    TextField("Kde jinde", text: $customPlace)
                }
            }

            Section("Hodnocení") {
                Toggle("Hodnotit", isOn: $rate)
                if rate {
                    Stepper("★ \(rating)/10", value: $rating, in: 1...10)
                }
            }

            Section("Poznámka") {
                TextField("Poznámka", text: $note, axis: .vertical)
                    .lineLimit(3...6)
            }

            if let saveError {
                Section { Text(saveError).foregroundStyle(.red) }
            }

            Section {
                Button("Uložit") { Task { await save(item) } }
                    .disabled(saving)
            }
        }
        .environment(\.locale, Locale(identifier: "cs_CZ"))
    }

    private func save(_ item: TMDBItem) async {
        // a quick double tap starts two tasks before .disabled(saving) re-renders
        guard !saving else { return }
        saving = true
        saveError = nil
        defer { saving = false }

        let chosenPlace = place == Self.other ? customPlace.trimmingCharacters(in: .whitespacesAndNewlines) : place
        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let row = NewViewing(
            tmdbId: item.tmdbId,
            mediaType: item.mediaType,
            title: item.title,
            posterPath: item.posterPath,
            releaseYear: item.releaseYear,
            watchedOn: DateOnly.string(from: monthOnly ? DateOnly.firstOfMonth(date) : date),
            place: chosenPlace.isEmpty ? nil : chosenPlace,
            rating: rate ? rating : nil,
            note: trimmedNote.isEmpty ? nil : trimmedNote)
        do {
            try await supabase.from("viewings").insert(row).execute()
            dismiss()
        } catch {
            saveError = error.localizedDescription
        }
    }
}
