import Foundation

/// Detail of a movie (`/movie/{id}` + credits, videos, release_dates) or series
/// (`/tv/{id}` + aggregate_credits, videos, content_ratings), flattened for the detail screen.
nonisolated struct TMDBDetail: Decodable, Sendable {
    let title: String
    let originalTitle: String?
    let tagline: String?
    var overview: String
    let posterPath: String?
    let backdropPath: String?
    let firstYear: Int?
    /// Year of the last episode, only for series that have ended.
    let lastYear: Int?
    /// Minutes; movies only.
    let runtime: Int?
    let numberOfSeasons: Int?
    let numberOfEpisodes: Int?
    let voteAverage: Double
    let voteCount: Int
    let genres: [String]
    /// Age rating, Czech if known, otherwise US.
    let certification: String?
    let directors: [String]
    let writers: [String]
    /// Series creators (`created_by`).
    let creators: [String]
    let cast: [CastMember]
    let trailerURL: URL?
    let seasons: [Season]

    nonisolated struct CastMember: Identifiable, Sendable {
        /// Billing position; a person may be listed twice for two characters, so the TMDB person id is not unique.
        let id: Int
        let name: String
        let character: String?
        let profilePath: String?
    }

    nonisolated struct Season: Decodable, Identifiable, Sendable {
        let id: Int
        let name: String
        let seasonNumber: Int
        let episodeCount: Int?
        let airDate: String?
        let posterPath: String?

        var year: Int? { airDate.flatMap { Int($0.prefix(4)) } }

        enum CodingKeys: String, CodingKey {
            case id, name
            case seasonNumber = "season_number"
            case episodeCount = "episode_count"
            case airDate = "air_date"
            case posterPath = "poster_path"
        }
    }

    // MARK: - Raw TMDB shapes

    private nonisolated struct Named: Decodable, Sendable {
        let name: String
    }

    private nonisolated struct Credits: Decodable, Sendable {
        let cast: [Cast]
        let crew: [Crew]

        struct Cast: Decodable, Sendable {
            let name: String
            let profilePath: String?
            /// Movie credits.
            let character: String?
            /// Series aggregate credits: one entry per character played across seasons.
            let roles: [Role]?

            struct Role: Decodable, Sendable {
                let character: String?
            }

            enum CodingKeys: String, CodingKey {
                case name, character, roles
                case profilePath = "profile_path"
            }
        }

        /// Aggregate (series) crew has `jobs` instead of `job`; series show `created_by` instead.
        struct Crew: Decodable, Sendable {
            let name: String
            let job: String?
        }
    }

    private nonisolated struct Videos: Decodable, Sendable {
        let results: [Video]

        struct Video: Decodable, Sendable {
            let key: String
            let site: String
            let type: String
            let language: String?

            enum CodingKeys: String, CodingKey {
                case key, site, type
                case language = "iso_639_1"
            }
        }
    }

    private nonisolated struct ReleaseDates: Decodable, Sendable {
        let results: [Country]

        struct Country: Decodable, Sendable {
            let country: String
            let releaseDates: [Release]

            struct Release: Decodable, Sendable {
                let certification: String?
            }

            enum CodingKeys: String, CodingKey {
                case country = "iso_3166_1"
                case releaseDates = "release_dates"
            }
        }
    }

    private nonisolated struct ContentRatings: Decodable, Sendable {
        let results: [Country]

        struct Country: Decodable, Sendable {
            let country: String
            let rating: String?

            enum CodingKeys: String, CodingKey {
                case rating
                case country = "iso_3166_1"
            }
        }
    }

    private enum CodingKeys: String, CodingKey {
        case title, name, tagline, overview, runtime, genres, credits, videos, seasons, status
        case originalTitle = "original_title"
        case originalName = "original_name"
        case posterPath = "poster_path"
        case backdropPath = "backdrop_path"
        case releaseDate = "release_date"
        case firstAirDate = "first_air_date"
        case lastAirDate = "last_air_date"
        case numberOfSeasons = "number_of_seasons"
        case numberOfEpisodes = "number_of_episodes"
        case voteAverage = "vote_average"
        case voteCount = "vote_count"
        case createdBy = "created_by"
        case aggregateCredits = "aggregate_credits"
        case releaseDates = "release_dates"
        case contentRatings = "content_ratings"
    }

    private static let castLimit = 15

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // movies use title/original_title/release_date, series use name/original_name/first_air_date
        title = try c.decodeIfPresent(String.self, forKey: .title)
            ?? c.decodeIfPresent(String.self, forKey: .name) ?? ""
        let original = try c.decodeIfPresent(String.self, forKey: .originalTitle)
            ?? c.decodeIfPresent(String.self, forKey: .originalName)
        originalTitle = original == title ? nil : original
        tagline = try c.decodeIfPresent(String.self, forKey: .tagline).flatMap { $0.isEmpty ? nil : $0 }
        overview = try c.decodeIfPresent(String.self, forKey: .overview) ?? ""
        posterPath = try c.decodeIfPresent(String.self, forKey: .posterPath)
        backdropPath = try c.decodeIfPresent(String.self, forKey: .backdropPath)

        let firstDate = try c.decodeIfPresent(String.self, forKey: .releaseDate)
            ?? c.decodeIfPresent(String.self, forKey: .firstAirDate) ?? ""
        firstYear = Int(firstDate.prefix(4))
        let status = try c.decodeIfPresent(String.self, forKey: .status)
        if status == "Ended" || status == "Canceled", let last = try c.decodeIfPresent(String.self, forKey: .lastAirDate) {
            lastYear = Int(last.prefix(4))
        } else {
            lastYear = nil
        }

        runtime = try c.decodeIfPresent(Int.self, forKey: .runtime).flatMap { $0 > 0 ? $0 : nil }
        numberOfSeasons = try c.decodeIfPresent(Int.self, forKey: .numberOfSeasons)
        numberOfEpisodes = try c.decodeIfPresent(Int.self, forKey: .numberOfEpisodes)
        voteAverage = try c.decodeIfPresent(Double.self, forKey: .voteAverage) ?? 0
        voteCount = try c.decodeIfPresent(Int.self, forKey: .voteCount) ?? 0
        genres = try c.decodeIfPresent([Named].self, forKey: .genres)?.map(\.name) ?? []
        creators = try c.decodeIfPresent([Named].self, forKey: .createdBy)?.map(\.name) ?? []
        seasons = try c.decodeIfPresent([Season].self, forKey: .seasons) ?? []

        let credits = try c.decodeIfPresent(Credits.self, forKey: .credits)
            ?? c.decodeIfPresent(Credits.self, forKey: .aggregateCredits)
        let crew = credits?.crew ?? []
        directors = Self.unique(crew.filter { $0.job == "Director" }.map(\.name))
        writers = Self.unique(crew.filter { $0.job == "Screenplay" || $0.job == "Writer" }.map(\.name))
        cast = (credits?.cast ?? []).prefix(Self.castLimit).enumerated().map { i, person in
            let character = person.character ?? person.roles?.compactMap(\.character).first
            return CastMember(
                id: i, name: person.name,
                character: character.flatMap { $0.isEmpty ? nil : $0 },
                profilePath: person.profilePath)
        }

        let youtube = try c.decodeIfPresent(Videos.self, forKey: .videos)?.results.filter { $0.site == "YouTube" } ?? []
        let trailer = youtube.first { $0.type == "Trailer" && $0.language == "cs" }
            ?? youtube.first { $0.type == "Trailer" }
            ?? youtube.first { $0.type == "Teaser" }
        trailerURL = trailer.flatMap { URL(string: "https://www.youtube.com/watch?v=\($0.key)") }

        var ratings: [String: String] = [:]
        for country in try c.decodeIfPresent(ReleaseDates.self, forKey: .releaseDates)?.results ?? [] {
            ratings[country.country] = country.releaseDates.compactMap(\.certification).first { !$0.isEmpty }
        }
        for country in try c.decodeIfPresent(ContentRatings.self, forKey: .contentRatings)?.results ?? [] {
            if let rating = country.rating, !rating.isEmpty { ratings[country.country] = rating }
        }
        certification = ratings["CZ"] ?? ratings["US"]
    }

    private static func unique(_ names: [String]) -> [String] {
        var seen = Set<String>()
        return names.filter { seen.insert($0).inserted }
    }
}
