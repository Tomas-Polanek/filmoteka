import SwiftUI

enum TMDB {
    nonisolated private struct SearchResponse: Decodable, Sendable {
        let results: [TMDBItem]
    }

    nonisolated private struct OverviewOnly: Decodable, Sendable {
        let overview: String?
    }

    /// RFC 3986 unreserved characters; everything else in a query value gets percent-encoded.
    /// URLComponents.queryItems leaves "+" as is, which TMDB reads as a space ("Disney+" -> "Disney ").
    private static let unreserved = CharacterSet(
        charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

    /// Multi-search in Czech; people are dropped, only movies and series remain.
    static func search(_ q: String) async throws -> [TMDBItem] {
        let response: SearchResponse = try await get(
            "/search/multi", query: ["query": q, "language": "cs-CZ", "include_adult": "false"])
        return response.results.filter { $0.mediaType == "movie" || $0.mediaType == "tv" }
    }

    /// Full detail of a movie or series in Czech, with credits, videos and age ratings in one request.
    static func detail(mediaType: String, id: Int) async throws -> TMDBDetail {
        let isTV = mediaType == "tv"
        let path = isTV ? "/tv/\(id)" : "/movie/\(id)"
        var detail: TMDBDetail = try await get(path, query: [
            "language": "cs-CZ",
            "append_to_response": isTV ? "aggregate_credits,videos,content_ratings" : "credits,videos,release_dates",
            // `language` alone would limit videos to Czech ones, which rarely exist.
            "include_video_language": "cs,en",
        ])
        // Many titles have no Czech overview; the English one is better than nothing and is not worth failing over.
        if detail.overview.isEmpty, let en: OverviewOnly = try? await get(path, query: ["language": "en-US"]) {
            detail.overview = en.overview ?? ""
        }
        return detail
    }

    /// `path` is a TMDB image path (poster_path, backdrop_path, profile_path), e.g. "/abc.jpg" (leading slash included).
    static func posterURL(_ path: String?, size: String = "w342") -> URL? {
        guard let path else { return nil }
        return URL(string: "https://image.tmdb.org/t/p/\(size)\(path)")
    }

    /// The single transport for TMDB API calls. `path` is relative to the API version, e.g. "/movie/11".
    /// Goes through the `tmdb` Supabase Edge Function, which holds the TMDB token; the user's session authorizes it.
    private static func get<T: Decodable>(_ path: String, query: [String: String]) async throws -> T {
        guard var components = URLComponents(
            url: Config.supabaseURL.appending(path: "functions/v1/tmdb/3" + path), resolvingAgainstBaseURL: false)
        else { throw URLError(.badURL) }
        components.percentEncodedQueryItems = query.sorted { $0.key < $1.key }.map {
            URLQueryItem(name: $0.key, value: $0.value.addingPercentEncoding(withAllowedCharacters: unreserved))
        }
        guard let url = components.url else { throw URLError(.badURL) }

        // `session` refreshes an expired access token before returning it.
        let session = try await supabase.auth.session
        var request = URLRequest(url: url)
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(Config.supabaseKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

/// Poster with a placeholder; sized by the caller's frame (2:3 ratio).
struct PosterView: View {
    let path: String?
    var size = "w154"

    var body: some View {
        AsyncImage(url: TMDB.posterURL(path, size: size)) { phase in
            if let image = phase.image {
                image.resizable().scaledToFill()
            } else {
                ZStack {
                    Color.gray.opacity(0.2)
                    Image(systemName: "film").foregroundStyle(.secondary)
                }
            }
        }
        .aspectRatio(2.0 / 3.0, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}
