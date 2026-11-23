import SwiftUI
import Supabase

struct TitleDetailView: View {
    let title: TitleSummary

    @State private var viewings: [Viewing] = []
    @State private var error: String?
    @State private var sheet: Sheet?
    @State private var toDelete: Viewing?
    @State private var detail: TMDBDetail?
    @State private var detailFailed = false

    private enum Sheet: Identifiable {
        case add
        case edit(Viewing)

        var id: String {
            switch self {
            case .add: "add"
            case .edit(let v): "edit-\(v.id)"
            }
        }
    }

    private var average: Double? {
        let ratings = viewings.compactMap(\.rating)
        guard !ratings.isEmpty else { return nil }
        return Double(ratings.reduce(0, +)) / Double(ratings.count)
    }

    var body: some View {
        List {
            Section {
                DetailHeader(title: title, detail: detail, failed: detailFailed)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }

            if let detail {
                OverviewSection(detail: detail)
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
                        Button { sheet = .edit(v) } label: { ViewingRow(viewing: v) }
                            .buttonStyle(.plain)
                            .swipeActions {
                                Button("Smazat", role: .destructive) { toDelete = v }
                            }
                    }
                }
            }

            if let detail {
                if !detail.seasons.isEmpty {
                    Section("Sezóny") {
                        ForEach(detail.seasons) { SeasonRow(season: $0) }
                    }
                }

                if !detail.cast.isEmpty {
                    Section("Herci") {
                        ScrollView(.horizontal, showsIndicators: false) {
                            LazyHStack(alignment: .top, spacing: 12) {
                                ForEach(detail.cast) { CastCard(member: $0) }
                            }
                            .padding(.horizontal)
                        }
                        .listRowInsets(EdgeInsets(top: 12, leading: 0, bottom: 12, trailing: 0))
                    }
                }
            }
        }
        .listStyle(.grouped)
        // Let the backdrop start right under the navigation bar.
        .contentMargins(.top, 0, for: .scrollContent)
        .navigationTitle(title.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Přidat zhlédnutí") { sheet = .add }
            }
        }
        .task { await load() }
        .task { await loadDetail() }
        .refreshable {
            await load()
            if detail == nil { await loadDetail() }
        }
        .sheet(item: $sheet, onDismiss: { Task { await load() } }) { sheet in
            switch sheet {
            case .add: AddViewingView(prefill: TMDBItem(title))
            case .edit(let v): AddViewingView(prefill: TMDBItem(title), editing: v)
            }
        }
        .alert(
            "Smazat zhlédnutí?",
            isPresented: Binding(get: { toDelete != nil }, set: { if !$0 { toDelete = nil } }),
            presenting: toDelete
        ) { v in
            Button("Smazat", role: .destructive) { Task { await delete(v) } }
            Button("Zrušit", role: .cancel) {}
        } message: { v in
            Text(DateOnly.day(v.watchedOn))
        }
    }

    // Filters must come before order(): order() returns a builder without eq().
    private func load() async {
        do {
            viewings = try await supabase.from("viewings")
                .select()
                .eq("user_id", value: try myUserId())
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

    private func loadDetail() async {
        do {
            detail = try await TMDB.detail(mediaType: title.mediaType, id: title.tmdbId)
            detailFailed = false
        } catch {
            if !Task.isCancelled { detailFailed = true }
        }
    }

    private func delete(_ viewing: Viewing) async {
        viewings.removeAll { $0.id == viewing.id }
        do {
            try await supabase.from("viewings").delete().eq("id", value: viewing.id).execute()
        } catch {
            self.error = error.localizedDescription
            await load()
        }
    }
}

private struct ViewingRow: View {
    let viewing: Viewing

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(DateOnly.day(viewing.watchedOn)).font(.headline)
                if let season = viewing.season {
                    Text(season == 0 ? "Speciály" : "Sezóna \(season)")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
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

/// Backdrop fading into the list background, poster overlapping it, title and facts.
/// Until TMDB answers it shows what the diary already knows, so the screen is never blank.
private struct DetailHeader: View {
    let title: TitleSummary
    let detail: TMDBDetail?
    let failed: Bool

    private let background = Color(uiColor: .systemGroupedBackground)

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            backdrop

            HStack(alignment: .bottom, spacing: 14) {
                PosterView(path: title.posterPath, size: "w342")
                    .frame(width: 110)
                    .shadow(color: .black.opacity(0.4), radius: 8, y: 4)
                VStack(alignment: .leading, spacing: 4) {
                    Text(title.title).font(.title2.bold())
                    if let original = detail?.originalTitle {
                        Text(original).font(.subheadline).foregroundStyle(.secondary)
                    }
                    Text(facts).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal)
            .padding(.top, -90)

            if let detail {
                chips(detail)
                if let trailer = detail.trailerURL {
                    Link(destination: trailer) {
                        // Inside a List row the icon takes the accent tint, i.e. blue on the blue button.
                        Label("Přehrát trailer", systemImage: "play.fill")
                            .foregroundStyle(.white)
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.horizontal)
                }
            } else if failed {
                Label("Podrobnosti z TMDB se nepodařilo načíst.", systemImage: "exclamationmark.triangle")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
            } else {
                ProgressView().padding(.horizontal)
            }
        }
        .padding(.bottom, 8)
    }

    private var backdrop: some View {
        Color.clear
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            .overlay {
                AsyncImage(url: TMDB.posterURL(detail?.backdropPath, size: "w780")) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Color.gray.opacity(0.2)
                    }
                }
            }
            .clipped()
            .overlay {
                LinearGradient(
                    stops: [.init(color: background.opacity(0), location: 0.35), .init(color: background, location: 1)],
                    startPoint: .top, endPoint: .bottom)
            }
    }

    /// "1977 · 2 h 1 min · TMDB 8,2"; before TMDB loads: "Film · 1977".
    private var facts: String {
        guard let detail else {
            let kind = title.mediaType == "tv" ? "Seriál" : "Film"
            return title.releaseYear.map { "\(kind) · \($0)" } ?? kind
        }
        var parts: [String] = []
        if let first = detail.firstYear ?? title.releaseYear {
            parts.append(detail.lastYear.map { $0 == first ? "\(first)" : "\(first)–\($0)" } ?? "\(first)")
        }
        if let runtime = detail.runtime {
            let h = runtime / 60, m = runtime % 60
            parts.append(h == 0 ? "\(m) min" : m == 0 ? "\(h) h" : "\(h) h \(m) min")
        }
        if let seasons = detail.numberOfSeasons {
            parts.append("\(seasons) " + czechPlural(seasons, "sezóna", "sezóny", "sezón"))
        }
        if let episodes = detail.numberOfEpisodes {
            parts.append("\(episodes) " + czechPlural(episodes, "epizoda", "epizody", "epizod"))
        }
        if detail.voteCount > 0 {
            parts.append("TMDB " + detail.voteAverage.formatted(.number.precision(.fractionLength(1))))
        }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder
    private func chips(_ detail: TMDBDetail) -> some View {
        if detail.certification != nil || !detail.genres.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    if let certification = detail.certification {
                        Text(certification)
                            .font(.caption.bold())
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .overlay(Capsule().strokeBorder(.secondary))
                    }
                    ForEach(detail.genres, id: \.self) { genre in
                        Text(genre)
                            .font(.caption)
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(.quaternary, in: Capsule())
                    }
                }
                .padding(.horizontal)
            }
        }
    }
}

/// Tagline, overview with a "Více" toggle, and the people behind the title.
private struct OverviewSection: View {
    let detail: TMDBDetail

    @State private var expanded = false

    private var isEmpty: Bool {
        detail.tagline == nil && detail.overview.isEmpty
            && detail.directors.isEmpty && detail.writers.isEmpty && detail.creators.isEmpty
    }

    var body: some View {
        if !isEmpty {
            Section("Popis") {
                if detail.tagline != nil || !detail.overview.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        if let tagline = detail.tagline {
                            Text(tagline).italic().foregroundStyle(.secondary)
                        }
                        if !detail.overview.isEmpty {
                            Text(detail.overview).lineLimit(expanded ? nil : 5)
                            // A character count is a cheap stand-in for "does it overflow five lines".
                            if detail.overview.count > 280 {
                                Button(expanded ? "Méně" : "Více") {
                                    withAnimation { expanded.toggle() }
                                }
                                .font(.subheadline.bold())
                                .buttonStyle(.borderless)
                            }
                        }
                    }
                }
                if !detail.directors.isEmpty {
                    LabeledContent("Režie", value: detail.directors.joined(separator: ", "))
                }
                if !detail.writers.isEmpty {
                    LabeledContent("Scénář", value: detail.writers.joined(separator: ", "))
                }
                if !detail.creators.isEmpty {
                    LabeledContent("Tvůrci", value: detail.creators.joined(separator: ", "))
                }
            }
        }
    }
}

private struct CastCard: View {
    let member: TMDBDetail.CastMember

    var body: some View {
        VStack(spacing: 4) {
            AsyncImage(url: TMDB.posterURL(member.profilePath, size: "w185")) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                } else {
                    ZStack {
                        Color.gray.opacity(0.2)
                        Image(systemName: "person.fill").font(.title).foregroundStyle(.secondary)
                    }
                }
            }
            .frame(width: 80, height: 80)
            .clipShape(Circle())

            Text(member.name).font(.caption.bold()).lineLimit(2)
            if let character = member.character {
                Text(character).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
            }
        }
        .multilineTextAlignment(.center)
        .frame(width: 90)
    }
}

private struct SeasonRow: View {
    let season: TMDBDetail.Season

    var body: some View {
        HStack(spacing: 12) {
            PosterView(path: season.posterPath, size: "w92").frame(width: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(season.name)
                Text(info).font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }

    private var info: String {
        var parts: [String] = []
        if let count = season.episodeCount {
            parts.append("\(count) " + czechPlural(count, "epizoda", "epizody", "epizod"))
        }
        if let year = season.year { parts.append("\(year)") }
        return parts.joined(separator: " · ")
    }
}

/// Czech noun form for a count: 1 sezóna, 2–4 sezóny, 0 and 5+ sezón.
private func czechPlural(_ n: Int, _ one: String, _ few: String, _ many: String) -> String {
    switch n {
    case 1: one
    case 2...4: few
    default: many
    }
}
