import SwiftUI
import Supabase

struct TitlesView: View {
    private enum Filter: String, CaseIterable, Identifiable {
        case all = "Vše"
        case movie = "Filmy"
        case tv = "Seriály"
        var id: String { rawValue }
    }

    // Raw values are persisted via @AppStorage, so keep them stable; labels are separate.
    private enum Sort: String, CaseIterable, Identifiable {
        case lastWatched, rating, title, viewCount, releaseYear
        var id: String { rawValue }
        var label: String {
            switch self {
            case .lastWatched: "Naposledy viděno"
            case .rating: "Hodnocení"
            case .title: "Název"
            case .viewCount: "Počet zhlédnutí"
            case .releaseYear: "Rok vydání"
            }
        }
    }

    /// Strict ordering for `sort`; nil means "tied", falling through to the default tie-break.
    private static func ordered(_ a: TitleSummary, _ b: TitleSummary, by sort: Sort) -> Bool? {
        func desc<T: Comparable>(_ x: T?, _ y: T?) -> Bool? {
            switch (x, y) {
            case let (x?, y?): x == y ? nil : x > y
            case (_?, nil): true
            case (nil, _?): false
            case (nil, nil): nil
            }
        }
        switch sort {
        case .lastWatched: return nil
        case .rating: return desc(a.avgRating, b.avgRating)
        case .title:
            let r = a.title.localizedStandardCompare(b.title)
            return r == .orderedSame ? nil : r == .orderedAscending
        case .viewCount: return desc(a.viewCount, b.viewCount)
        case .releaseYear: return desc(a.releaseYear, b.releaseYear)
        }
    }

    @State private var titles: [TitleSummary] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var search = ""
    @State private var filter = Filter.all
    @AppStorage("titlesSort") private var sort = Sort.lastWatched
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
        .sorted { a, b in
            if let r = Self.ordered(a, b, by: sort) { return r }
            // dates are "yyyy-MM-dd", so string order is chronological
            if a.lastWatched != b.lastWatched { return a.lastWatched > b.lastWatched }
            return a.title.localizedStandardCompare(b.title) == .orderedAscending
        }
    }

    var body: some View {
        NavigationStack {
            List {
                // A list row rather than a top safe-area inset: the inset covered the large title.
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
                ForEach(shown) { t in
                    NavigationLink(value: t) { TitleRow(title: t) }
                }
                TMDBAttribution()
            }
            .navigationTitle("Filmoteka")
            .navigationDestination(for: TitleSummary.self) { TitleDetailView(title: $0) }
            .searchable(text: $search, prompt: "Hledat v zhlédnutém")
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
                    Menu {
                        Picker("Řadit podle", selection: $sort) {
                            ForEach(Sort.allCases) { Text($0.label).tag($0) }
                        }
                    } label: {
                        Label("Řadit", systemImage: "arrow.up.arrow.down")
                    }
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
