import SwiftUI

enum TMDB {
    nonisolated private struct SearchResponse: Decodable, Sendable {
        let results: [TMDBItem]
    }

    /// RFC 3986 unreserved characters; everything else in a query value gets percent-encoded.
    /// URLComponents.queryItems leaves "+" as is, which TMDB reads as a space ("Disney+" -> "Disney ").
    private static let unreserved = CharacterSet(
        charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

    /// Multi-search in Czech; people are dropped, only movies and series remain.
    static func search(_ q: String) async throws -> [TMDBItem] {
        var components = URLComponents()
        components.scheme = "https"
        components.host = "api.themoviedb.org"
        components.path = "/3/search/multi"
        components.percentEncodedQueryItems = [
            ("query", q),
            ("language", "cs-CZ"),
            ("include_adult", "false"),
        ].map { URLQueryItem(name: $0, value: $1.addingPercentEncoding(withAllowedCharacters: unreserved)) }
        guard let url = components.url else { throw URLError(.badURL) }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(Config.tmdbToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(SearchResponse.self, from: data).results
            .filter { $0.mediaType == "movie" || $0.mediaType == "tv" }
    }

    /// `path` is TMDB's poster_path, e.g. "/abc.jpg" (leading slash included).
    static func posterURL(_ path: String?, size: String = "w342") -> URL? {
        guard let path else { return nil }
        return URL(string: "https://image.tmdb.org/t/p/\(size)\(path)")
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

/// TMDB attribution notice required by the TMDB API terms; put it as the last section of a list.
struct TMDBAttribution: View {
    var body: some View {
        Section {
        } footer: {
            VStack(spacing: 4) {
                Text("Tato aplikace používá TMDB a TMDB API, ale není schválena, certifikována ani jinak podporována společností TMDB.")
                Text("This application uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.")
            }
            .font(.caption2)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
        }
    }
}
