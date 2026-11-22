import Foundation

// Models are `nonisolated` + `Sendable` so their Codable conformances are not main-actor isolated
// under Xcode 26's default MainActor isolation: supabase-swift decodes off the main actor.

/// A single watching, as stored in public.viewings (read side).
nonisolated struct Viewing: Decodable, Identifiable, Sendable {
    let id: Int
    let watchedOn: String  // "yyyy-MM-dd"
    let place: String?
    let rating: Int?
    let note: String?
    let season: Int?  // tv only; nil = whole series / unspecified, 0 = specials

    enum CodingKeys: String, CodingKey {
        case id, place, rating, note, season
        case watchedOn = "watched_on"
    }
}

/// Insert payload: no id / user_id / created_at, the database fills those.
nonisolated struct NewViewing: Encodable, Sendable {
    let tmdbId: Int
    let mediaType: String
    let title: String
    let posterPath: String?
    let releaseYear: Int?
    let watchedOn: String  // "yyyy-MM-dd"
    let place: String?
    let rating: Int?
    let note: String?
    let season: Int?

    enum CodingKeys: String, CodingKey {
        case title, place, rating, note, season
        case tmdbId = "tmdb_id"
        case mediaType = "media_type"
        case posterPath = "poster_path"
        case releaseYear = "release_year"
        case watchedOn = "watched_on"
    }
}

/// Update payload. Encodes nil as JSON null on purpose: the default synthesized Encodable would omit nil keys,
/// so clearing the place / rating / note / season in the form would silently keep the old value in the database.
nonisolated struct ViewingUpdate: Encodable, Sendable {
    let watchedOn: String  // "yyyy-MM-dd"
    let place: String?
    let rating: Int?
    let note: String?
    let season: Int?

    enum CodingKeys: String, CodingKey {
        case place, rating, note, season
        case watchedOn = "watched_on"
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(watchedOn, forKey: .watchedOn)
        try c.encode(place, forKey: .place)
        try c.encode(rating, forKey: .rating)
        try c.encode(note, forKey: .note)
        try c.encode(season, forKey: .season)
    }
}

/// A row of public.titles (one per film/series the user has watched).
nonisolated struct TitleSummary: Decodable, Identifiable, Hashable, Sendable {
    let mediaType: String
    let tmdbId: Int
    let title: String
    let posterPath: String?
    let releaseYear: Int?
    let viewCount: Int
    let lastWatched: String
    let avgRating: Double?

    var id: String { "\(mediaType)-\(tmdbId)" }

    enum CodingKeys: String, CodingKey {
        case title
        case mediaType = "media_type"
        case tmdbId = "tmdb_id"
        case posterPath = "poster_path"
        case releaseYear = "release_year"
        case viewCount = "view_count"
        case lastWatched = "last_watched"
        case avgRating = "avg_rating"
    }
}

/// A row of public.watchlist ("Chci vidět").
nonisolated struct WatchlistItem: Decodable, Identifiable, Sendable {
    let id: Int
    let tmdbId: Int
    let mediaType: String
    let title: String
    let posterPath: String?
    let releaseYear: Int?
    let note: String?
    let addedAt: String  // timestamptz as returned by PostgREST; only the database sorts by it

    enum CodingKeys: String, CodingKey {
        case id, title, note
        case tmdbId = "tmdb_id"
        case mediaType = "media_type"
        case posterPath = "poster_path"
        case releaseYear = "release_year"
        case addedAt = "added_at"
    }
}

/// Watchlist insert payload: id / user_id / added_at come from the database.
nonisolated struct NewWatchlistItem: Encodable, Sendable {
    let tmdbId: Int
    let mediaType: String
    let title: String
    let posterPath: String?
    let releaseYear: Int?

    init(_ item: TMDBItem) {
        tmdbId = item.tmdbId
        mediaType = item.mediaType
        title = item.title
        posterPath = item.posterPath
        releaseYear = item.releaseYear
    }

    enum CodingKeys: String, CodingKey {
        case title
        case tmdbId = "tmdb_id"
        case mediaType = "media_type"
        case posterPath = "poster_path"
        case releaseYear = "release_year"
    }
}

/// A TMDB search result (movie or tv).
nonisolated struct TMDBItem: Decodable, Identifiable, Hashable, Sendable {
    let tmdbId: Int
    let mediaType: String
    let title: String
    let posterPath: String?
    let releaseYear: Int?

    var id: String { "\(mediaType)-\(tmdbId)" }

    init(tmdbId: Int, mediaType: String, title: String, posterPath: String?, releaseYear: Int?) {
        self.tmdbId = tmdbId
        self.mediaType = mediaType
        self.title = title
        self.posterPath = posterPath
        self.releaseYear = releaseYear
    }

    init(_ t: TitleSummary) {
        self.init(
            tmdbId: t.tmdbId, mediaType: t.mediaType, title: t.title,
            posterPath: t.posterPath, releaseYear: t.releaseYear)
    }

    init(_ w: WatchlistItem) {
        self.init(
            tmdbId: w.tmdbId, mediaType: w.mediaType, title: w.title,
            posterPath: w.posterPath, releaseYear: w.releaseYear)
    }

    enum CodingKeys: String, CodingKey {
        case id, title, name
        case mediaType = "media_type"
        case posterPath = "poster_path"
        case releaseDate = "release_date"
        case firstAirDate = "first_air_date"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        tmdbId = try c.decode(Int.self, forKey: .id)
        mediaType = try c.decode(String.self, forKey: .mediaType)
        // movies use title/release_date, series use name/first_air_date
        title = try c.decodeIfPresent(String.self, forKey: .title)
            ?? c.decodeIfPresent(String.self, forKey: .name) ?? ""
        posterPath = try c.decodeIfPresent(String.self, forKey: .posterPath)
        let date = try c.decodeIfPresent(String.self, forKey: .releaseDate)
            ?? c.decodeIfPresent(String.self, forKey: .firstAirDate) ?? ""
        releaseYear = Int(date.prefix(4))
    }
}

/// Date-only handling in the device time zone. The database stores "yyyy-MM-dd"; month-only entries store the 1st.
/// Uses Sendable format styles (not DateFormatter) so the statics are concurrency-safe under any default isolation.
nonisolated enum DateOnly {
    private static let czech = Locale(identifier: "cs_CZ")
    private static let dayText = Date.FormatStyle(locale: czech, calendar: Calendar(identifier: .gregorian))
        .day().month(.wide).year()
    private static let monthText = Date.FormatStyle(locale: czech, calendar: Calendar(identifier: .gregorian))
        .month(.wide).year()

    static func string(from date: Date) -> String {
        date.formatted(Date.ISO8601FormatStyle(timeZone: .current).year().month().day())
    }

    static func date(from string: String) -> Date? {
        let parts = string.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar(identifier: .gregorian).date(
            from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    /// "5. ledna 2023"; falls back to the raw string if unparsable.
    static func day(_ string: String) -> String {
        date(from: string).map { $0.formatted(dayText) } ?? string
    }

    /// "leden 2023"
    static func month(_ date: Date) -> String { date.formatted(monthText) }

    static func firstOfMonth(_ date: Date) -> Date {
        let cal = Calendar(identifier: .gregorian)
        return cal.date(from: cal.dateComponents([.year, .month], from: date)) ?? date
    }

    /// January 1st of the year; used when only the year is known.
    static func firstOfYear(_ date: Date) -> Date {
        let cal = Calendar(identifier: .gregorian)
        return cal.date(from: cal.dateComponents([.year], from: date)) ?? date
    }
}
