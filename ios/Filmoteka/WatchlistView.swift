import SwiftUI
import Supabase

/// "Chci vidět": films/series to watch later. "Viděno" records a viewing and drops the item from the list.
struct WatchlistView: View {
    private enum Filter: String, CaseIterable, Identifiable {
        case all = "Vše"
        case movie = "Filmy"
        case tv = "Seriály"
        var id: String { rawValue }
    }

    @State private var items: [WatchlistItem] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var filter = Filter.all
    @State private var adding = false
    @State private var watched: WatchlistItem?

    private var shown: [WatchlistItem] {
        items.filter { i in
            switch filter {
            case .all: true
            case .movie: i.mediaType == "movie"
            case .tv: i.mediaType == "tv"
            }
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Typ", selection: $filter) {
                        ForEach(Filter.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
                if let error {
                    Text(error).foregroundStyle(.red)
                }
                ForEach(shown) { item in
                    WatchlistRow(item: item)
                        .swipeActions(edge: .trailing) {
                            Button("Smazat", role: .destructive) { Task { await remove(item) } }
                        }
                        .swipeActions(edge: .leading) {
                            Button("Viděno") { watched = item }
                                .tint(.green)
                        }
                }
                TMDBAttribution()
            }
            .navigationTitle("Chci vidět")
            .overlay {
                if loaded && shown.isEmpty {
                    ContentUnavailableView(
                        "Nic na seznamu", systemImage: "bookmark",
                        description: items.isEmpty ? Text("Přidej, co chceš vidět, tlačítkem +.") : nil)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { adding = true } label: { Label("Přidat", systemImage: "plus") }
                }
            }
            .refreshable { await load() }
            .sheet(isPresented: $adding, onDismiss: { Task { await load() } }) {
                WatchlistAddView(items: $items)
            }
            .sheet(item: $watched) { item in
                AddViewingView(prefill: TMDBItem(item), onSaved: { Task { await remove(item) } })
            }
            .task { await load() }
        }
    }

    private func load() async {
        do {
            items = try await supabase.from("watchlist")
                .select()
                .order("added_at", ascending: false)
                .order("id", ascending: false)
                .execute()
                .value
            error = nil
        } catch {
            if !Task.isCancelled { self.error = error.localizedDescription }
        }
        loaded = true
    }

    private func remove(_ item: WatchlistItem) async {
        do {
            try await supabase.from("watchlist").delete().eq("id", value: item.id).execute()
            items.removeAll { $0.id == item.id }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Add sheet: TMDB search; each pick adds the title, the sheet stays open for more.
private struct WatchlistAddView: View {
    @Binding var items: [WatchlistItem]
    @Environment(\.dismiss) private var dismiss
    @State private var message: Text?
    @State private var saving = false

    var body: some View {
        NavigationStack {
            TMDBSearchView(
                message: message,
                isChecked: contains,
                onSearch: { message = nil },
                onPick: { item in Task { await add(item) } })
            .navigationTitle("Přidat do Chci vidět")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Hotovo") { dismiss() }
                }
            }
        }
    }

    private func contains(_ item: TMDBItem) -> Bool {
        items.contains { $0.mediaType == item.mediaType && $0.tmdbId == item.tmdbId }
    }

    private func add(_ item: TMDBItem) async {
        guard !contains(item) else {
            message = Text("Už je v seznamu: \(item.title)").foregroundStyle(.orange)
            return
        }
        // a quick double tap starts two tasks before the first insert returns
        guard !saving else { return }
        saving = true
        defer { saving = false }
        do {
            let row: WatchlistItem = try await supabase.from("watchlist")
                .insert(NewWatchlistItem(item))
                .select()
                .single()
                .execute()
                .value
            items.insert(row, at: 0)
            message = Text("Přidáno: \(item.title)").foregroundStyle(.green)
        } catch let error as PostgrestError where error.code == "23505" {
            // unique_violation: added on another device since the list was loaded
            message = Text("Už je v seznamu: \(item.title)").foregroundStyle(.orange)
        } catch {
            message = Text(error.localizedDescription).foregroundStyle(.red)
        }
    }
}

private struct WatchlistRow: View {
    let item: WatchlistItem

    var body: some View {
        HStack(spacing: 12) {
            PosterView(path: item.posterPath, size: "w154")
                .frame(width: 46)
            VStack(alignment: .leading, spacing: 4) {
                Text(item.releaseYear.map { "\(item.title) (\($0))" } ?? item.title)
                    .font(.headline)
                Text(item.mediaType == "tv" ? "Seriál" : "Film")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if let note = item.note, !note.isEmpty {
                    Text(note).font(.subheadline).lineLimit(2)
                }
            }
        }
    }
}
