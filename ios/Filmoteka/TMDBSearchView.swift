import SwiftUI

/// TMDB search list (films + series). Used as step 1 of AddViewingView and in the watchlist's add sheet.
/// Must sit inside a NavigationStack: it puts its search field into the navigation bar.
struct TMDBSearchView: View {
    /// Shown above the results, e.g. "Uloženo: …"; the caller picks the style.
    var message: Text?
    /// Results for which this returns true get a checkmark (e.g. already on the watchlist).
    var isChecked: (TMDBItem) -> Bool = { _ in false }
    /// Called when a new non-empty query starts, so the caller can clear a stale `message`.
    var onSearch: () -> Void = {}
    let onPick: (TMDBItem) -> Void

    @State private var query = ""
    @State private var results: [TMDBItem] = []
    @State private var searchError: String?

    var body: some View {
        List {
            if let message { message }
            if let searchError {
                Text(searchError).foregroundStyle(.red)
            }
            ForEach(results) { r in
                Button { onPick(r) } label: {
                    HStack(spacing: 12) {
                        PosterView(path: r.posterPath, size: "w92").frame(width: 40)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.title).font(.headline)
                            Text(r.kindAndYear).font(.subheadline).foregroundStyle(.secondary)
                        }
                        if isChecked(r) {
                            Spacer()
                            Image(systemName: "checkmark").foregroundStyle(.tint)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .searchable(
            text: $query, placement: .navigationBarDrawer(displayMode: .always),
            prompt: "Hledat film nebo seriál"
        )
        .task(id: query) { await runSearch() }
    }

    /// Debounced by .task(id:): a new query cancels this task, so only the last keystroke survives the sleep.
    private func runSearch() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else {
            results = []
            searchError = nil
            return
        }
        onSearch()
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
}

extension TMDBItem {
    var kindLabel: String { mediaType == "tv" ? "Seriál" : "Film" }

    /// "Film · 1999", or just the kind when the year is unknown.
    var kindAndYear: String { releaseYear.map { "\(kindLabel) · \($0)" } ?? kindLabel }
}
