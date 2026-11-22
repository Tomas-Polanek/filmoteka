import SwiftUI
import Supabase

struct TitlesView: View {
    private enum Filter: String, CaseIterable, Identifiable {
        case all = "Vše"
        case movie = "Filmy"
        case tv = "Seriály"
        var id: String { rawValue }
    }

    @State private var titles: [TitleSummary] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var search = ""
    @State private var filter = Filter.all
    @State private var adding = false

    private var shown: [TitleSummary] {
        titles.filter { t in
            switch filter {
            case .all: true
            case .movie: t.mediaType == "movie"
            case .tv: t.mediaType == "tv"
            }
        }
        .filter { search.isEmpty || $0.title.localizedStandardContains(search) }
    }

    var body: some View {
        NavigationStack {
            List {
                if let error {
                    Text(error).foregroundStyle(.red)
                }
                ForEach(shown) { t in
                    NavigationLink(value: t) { TitleRow(title: t) }
                }
                TMDBAttribution()
            }
            .navigationTitle("Filmoteka")
            .navigationDestination(for: TitleSummary.self) { TitleDetailView(title: $0) }
            .searchable(text: $search, prompt: "Hledat v zhlédnutém")
            .safeAreaInset(edge: .top) {
                Picker("Typ", selection: $filter) {
                    ForEach(Filter.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.vertical, 8)
                .background(.bar)
            }
            .overlay {
                if loaded && shown.isEmpty {
                    if titles.isEmpty {
                        ContentUnavailableView(
                            "Zatím nic", systemImage: "film",
                            description: Text("Přidej první zhlédnutí tlačítkem +."))
                    } else {
                        ContentUnavailableView(
                            "Nic nenalezeno", systemImage: "magnifyingglass")
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Odhlásit") { Task { await signOut() } }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { adding = true } label: { Label("Přidat", systemImage: "plus") }
                }
            }
            .refreshable { await load() }
            .sheet(isPresented: $adding, onDismiss: { Task { await load() } }) {
                AddViewingView()
            }
            // also fires when returning from the detail screen, so changes there show up here
            .onAppear { Task { await load() } }
        }
    }

    private func load() async {
        do {
            titles = try await supabase.from("titles")
                .select()
                .order("last_watched", ascending: false)
                .execute()
                .value
            error = nil
        } catch {
            if !Task.isCancelled { self.error = error.localizedDescription }
        }
        loaded = true
    }

    private func signOut() async {
        do {
            try await supabase.auth.signOut(scope: .local)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct TitleRow: View {
    let title: TitleSummary

    var body: some View {
        HStack(spacing: 12) {
            PosterView(path: title.posterPath, size: "w154")
                .frame(width: 46)
            VStack(alignment: .leading, spacing: 4) {
                Text(title.releaseYear.map { "\(title.title) (\($0))" } ?? title.title)
                    .font(.headline)
                Text("×\(title.viewCount) · naposledy \(DateOnly.day(title.lastWatched))")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if let avg = title.avgRating {
                    Text("★ \(avg.formatted(.number.precision(.fractionLength(0...1))))")
                        .font(.subheadline)
                }
            }
        }
    }
}
