import SwiftUI
import Supabase

struct TitleDetailView: View {
    let title: TitleSummary

    @State private var viewings: [Viewing] = []
    @State private var error: String?
    @State private var adding = false

    private var average: Double? {
        let ratings = viewings.compactMap(\.rating)
        guard !ratings.isEmpty else { return nil }
        return Double(ratings.reduce(0, +)) / Double(ratings.count)
    }

    var body: some View {
        List {
            Section {
                VStack(spacing: 8) {
                    PosterView(path: title.posterPath, size: "w342")
                        .frame(maxWidth: 200)
                    Text(title.title).font(.title2.bold()).multilineTextAlignment(.center)
                    Text(subtitle).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
            }

            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }

            if !viewings.isEmpty {
                Section("Statistiky") {
                    LabeledContent("Počet zhlédnutí", value: "\(viewings.count)")
                    // viewings are sorted newest first
                    if let first = viewings.last {
                        LabeledContent("První", value: DateOnly.day(first.watchedOn))
                    }
                    if let last = viewings.first {
                        LabeledContent("Poslední", value: DateOnly.day(last.watchedOn))
                    }
                    if let average {
                        LabeledContent(
                            "Průměr",
                            value: "★ " + average.formatted(.number.precision(.fractionLength(0...1))))
                    }
                }

                Section("Zhlédnutí") {
                    ForEach(viewings) { v in
                        ViewingRow(viewing: v)
                    }
                    .onDelete(perform: delete)
                }
            }

            TMDBAttribution()
        }
        .navigationTitle(title.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Přidat zhlédnutí") { adding = true }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $adding, onDismiss: { Task { await load() } }) {
            AddViewingView(prefill: TMDBItem(title))
        }
    }

    private var subtitle: String {
        let kind = title.mediaType == "tv" ? "Seriál" : "Film"
        return title.releaseYear.map { "\(kind) · \($0)" } ?? kind
    }

    // Filters must come before order(): order() returns a builder without eq().
    private func load() async {
        do {
            viewings = try await supabase.from("viewings")
                .select()
                .eq("tmdb_id", value: title.tmdbId)
                .eq("media_type", value: title.mediaType)
                .order("watched_on", ascending: false)
                .order("id", ascending: false)
                .execute()
                .value
            error = nil
        } catch {
            if !Task.isCancelled { self.error = error.localizedDescription }
        }
    }

    private func delete(at offsets: IndexSet) {
        let ids = offsets.map { viewings[$0].id }
        viewings.remove(atOffsets: offsets)
        Task {
            do {
                for id in ids {
                    try await supabase.from("viewings").delete().eq("id", value: id).execute()
                }
            } catch {
                self.error = error.localizedDescription
                await load()
            }
        }
    }
}

private struct ViewingRow: View {
    let viewing: Viewing

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(DateOnly.day(viewing.watchedOn)).font(.headline)
                Spacer()
                if let rating = viewing.rating {
                    Text("★ \(rating)/10")
                }
            }
            if let place = viewing.place, !place.isEmpty {
                Text(place).font(.subheadline).foregroundStyle(.secondary)
            }
            if let note = viewing.note, !note.isEmpty {
                Text(note).font(.callout)
            }
        }
    }
}
