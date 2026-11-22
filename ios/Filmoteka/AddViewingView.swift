import SwiftUI
import Supabase

/// One form for both modes, like SleepTrack's form modal:
/// - create: step 1 picks a film/series via TMDB search (skipped when `prefill` is given), step 2 fills in the viewing.
/// - edit (`editing` given): goes straight to step 2 with the stored values.
struct AddViewingView: View {
    private static let places = [
        "Jellyfin", "Netflix", "HBO Max", "Disney+", "Prime Video",
        "Apple TV+", "SkyShowtime", "Kino", "TV", "Jiné",
    ]
    private static let other = "Jiné"
    private static let lastPlaceKey = "lastPlace"
    private static let calendar = Calendar(identifier: .gregorian)

    private enum Precision: String, CaseIterable, Identifiable {
        case day = "Den"
        case month = "Měsíc"
        case year = "Rok"
        var id: String { rawValue }
    }

    @Environment(\.dismiss) private var dismiss
    @State private var item: TMDBItem?
    private let editing: Viewing?
    /// "Uložit a přidat další" only makes sense when the user picks the title here, not when it is prefilled.
    private let canAddAnother: Bool

    @State private var query = ""
    @State private var results: [TMDBItem] = []
    @State private var searchError: String?
    @State private var savedInfo: String?

    @State private var date: Date
    @State private var precision = Precision.day
    @State private var place: String
    @State private var customPlace: String
    @State private var rate: Bool
    @State private var rating: Int
    @State private var note: String
    @State private var saving = false
    @State private var saveError: String?

    init(prefill: TMDBItem? = nil, editing: Viewing? = nil) {
        _item = State(initialValue: prefill)
        self.editing = editing
        canAddAnother = prefill == nil && editing == nil

        // Create mode remembers the last used place, so a batch of old films from one source needs no re-picking.
        let storedPlace = editing?.place ?? UserDefaults.standard.string(forKey: Self.lastPlaceKey)
        if let storedPlace, !storedPlace.isEmpty, !Self.places.contains(storedPlace) {
            _place = State(initialValue: Self.other)
            _customPlace = State(initialValue: storedPlace)
        } else {
            _place = State(initialValue: storedPlace.flatMap { $0.isEmpty ? nil : $0 } ?? Self.places[0])
            _customPlace = State(initialValue: "")
        }
        _date = State(initialValue: editing.flatMap { DateOnly.date(from: $0.watchedOn) } ?? Date())
        _rate = State(initialValue: editing?.rating != nil)
        _rating = State(initialValue: editing?.rating ?? 7)
        _note = State(initialValue: editing?.note ?? "")
    }

    var body: some View {
        NavigationStack {
            Group {
                if let item { form(for: item) } else { searchStep }
            }
            .navigationTitle(editing != nil ? "Upravit zhlédnutí" : item == nil ? "Vybrat titul" : "Zhlédnutí")
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
            if let savedInfo {
                Text(savedInfo).foregroundStyle(.green)
            }
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
        savedInfo = nil
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

    private var currentYear: Int { Self.calendar.component(.year, from: Date()) }
    private var currentMonth: Int { Self.calendar.component(.month, from: Date()) }

    /// What gets stored: the exact day, the 1st of the month, or January 1st.
    private var storedDate: Date {
        switch precision {
        case .day: date
        case .month: DateOnly.firstOfMonth(date)
        case .year: DateOnly.firstOfYear(date)
        }
    }

    /// Rebuilds `date` from year + month and never lets it land in the future.
    private func setDate(year: Int, month: Int) {
        let built = Self.calendar.date(from: DateComponents(year: year, month: month, day: 1)) ?? date
        date = min(built, Date())
    }

    private var yearBinding: Binding<Int> {
        Binding(
            get: { Self.calendar.component(.year, from: date) },
            set: { setDate(year: $0, month: Self.calendar.component(.month, from: date)) })
    }

    private var monthBinding: Binding<Int> {
        Binding(
            get: { Self.calendar.component(.month, from: date) },
            set: { setDate(year: Self.calendar.component(.year, from: date), month: $0) })
    }

    private var yearPicker: some View {
        Picker("Rok", selection: yearBinding) {
            ForEach((1900...currentYear).reversed(), id: \.self) { Text(String($0)).tag($0) }
        }
    }

    private var monthPicker: some View {
        let names = Locale(identifier: "cs_CZ").calendarMonths
        let selectedYear = Self.calendar.component(.year, from: date)
        return Picker("Měsíc", selection: monthBinding) {
            ForEach(1...(selectedYear == currentYear ? currentMonth : 12), id: \.self) {
                Text(names[$0 - 1]).tag($0)
            }
        }
    }

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
                Picker("Přesnost", selection: $precision) {
                    ForEach(Precision.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                switch precision {
                case .day:
                    DatePicker("Datum", selection: $date, in: ...Date(), displayedComponents: .date)
                case .month:
                    yearPicker
                    monthPicker
                case .year:
                    yearPicker
                }
                if precision != .day {
                    LabeledContent("Uloží se jako", value: DateOnly.day(DateOnly.string(from: storedDate)))
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
                Button(editing != nil ? "Uložit změny" : "Uložit") { Task { await save(item, addAnother: false) } }
                    .disabled(saving)
                if canAddAnother {
                    Button("Uložit a přidat další") { Task { await save(item, addAnother: true) } }
                        .disabled(saving)
                }
            }
        }
        .environment(\.locale, Locale(identifier: "cs_CZ"))
    }

    private func save(_ item: TMDBItem, addAnother: Bool) async {
        // a quick double tap starts two tasks before .disabled(saving) re-renders
        guard !saving else { return }
        saving = true
        saveError = nil
        defer { saving = false }

        let chosenPlace = place == Self.other ? customPlace.trimmingCharacters(in: .whitespacesAndNewlines) : place
        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let watchedOn = DateOnly.string(from: storedDate)
        let placeValue = chosenPlace.isEmpty ? nil : chosenPlace
        let ratingValue = rate ? rating : nil
        let noteValue = trimmedNote.isEmpty ? nil : trimmedNote
        do {
            if let editing {
                try await supabase.from("viewings")
                    .update(ViewingUpdate(watchedOn: watchedOn, place: placeValue, rating: ratingValue, note: noteValue))
                    .eq("id", value: editing.id)
                    .execute()
            } else {
                let row = NewViewing(
                    tmdbId: item.tmdbId,
                    mediaType: item.mediaType,
                    title: item.title,
                    posterPath: item.posterPath,
                    releaseYear: item.releaseYear,
                    watchedOn: watchedOn,
                    place: placeValue,
                    rating: ratingValue,
                    note: noteValue)
                try await supabase.from("viewings").insert(row).execute()
                if let placeValue { UserDefaults.standard.set(placeValue, forKey: Self.lastPlaceKey) }
            }
        } catch {
            saveError = error.localizedDescription
            return
        }

        if addAnother {
            // keep date, precision and place: old films usually come in batches from the same period/source
            savedInfo = "Uloženo: \(item.title)"
            self.item = nil
            query = ""
            results = []
            note = ""
            rate = false
            rating = 7
        } else {
            dismiss()
        }
    }
}

private extension Locale {
    /// Standalone month names for pickers, e.g. "leden" (the formatted forms would be genitive: "ledna").
    var calendarMonths: [String] {
        var cal = Calendar(identifier: .gregorian)
        cal.locale = self
        return cal.standaloneMonthSymbols
    }
}
