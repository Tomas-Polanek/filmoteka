import SwiftUI

/// One release from the bundled CHANGELOG.md (repo root). Format: "## 0.4.0 (2026-11-23)" followed by "- item" lines.
nonisolated struct Release: Identifiable, Sendable {
    let version: String
    let date: String?
    let items: [String]
    var id: String { version }
}

nonisolated enum Changelog {
    /// Parsed once; newest release first, exactly as written in the file.
    static let releases: [Release] = {
        guard let url = Bundle.main.url(forResource: "CHANGELOG", withExtension: "md"),
              let text = try? String(contentsOf: url, encoding: .utf8)
        else { return [] }
        return parse(text)
    }()

    static func parse(_ text: String) -> [Release] {
        var releases: [Release] = []
        var version: String?
        var date: String?
        var items: [String] = []

        func flush() {
            if let version { releases.append(Release(version: version, date: date, items: items)) }
        }

        for raw in text.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.hasPrefix("## "), let first = line.dropFirst(3).first, first.isNumber {
                flush()
                let header = line.dropFirst(3)
                version = String(header.prefix { $0 != " " })
                date = header.firstRange(of: "(").flatMap { open in
                    header[open.upperBound...].firstRange(of: ")").map { String(header[open.upperBound..<$0.lowerBound]) }
                }
                items = []
            } else if version != nil, line.hasPrefix("- ") {
                items.append(String(line.dropFirst(2)))
            }
        }
        flush()
        return releases
    }

    static var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
    }

    static var buildNumber: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?"
    }

    /// 0.x versions are beta.
    static var isBeta: Bool { appVersion.hasPrefix("0.") }

    static var current: Release? { releases.first { $0.version == appVersion } }

    /// "5. ledna 2026" from "2026-01-05".
    static func displayDate(_ date: String?) -> String? {
        date.map { DateOnly.day($0) }
    }
}

/// Small "BETA" capsule next to the version.
struct BetaBadge: View {
    var body: some View {
        Text("BETA")
            .font(.caption2.bold())
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(.orange.opacity(0.2), in: Capsule())
            .foregroundStyle(.orange)
    }
}

private struct ReleaseSection: View {
    let release: Release

    var body: some View {
        Section {
            ForEach(release.items, id: \.self) { item in
                Label(item, systemImage: "sparkle")
                    .labelStyle(BulletLabelStyle())
            }
        } header: {
            HStack {
                Text("Verze \(release.version)")
                Spacer()
                if let date = Changelog.displayDate(release.date) { Text(date) }
            }
        }
    }
}

private struct BulletLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            configuration.icon.foregroundStyle(.tint).font(.footnote)
            configuration.title
        }
    }
}

/// Full history, newest first (Nastavení → O aplikaci → Co je nového).
struct ChangelogView: View {
    var body: some View {
        List(Changelog.releases) { ReleaseSection(release: $0) }
            .navigationTitle("Co je nového")
            .navigationBarTitleDisplayMode(.inline)
    }
}

/// Shown once after the app was updated to a version that has a changelog entry.
struct WhatsNewSheet: View {
    let release: Release
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List { ReleaseSection(release: release) }
                .navigationTitle("Co je nového")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Hotovo") { dismiss() }
                    }
                }
        }
    }
}

/// Settings section with the version and a link to the full history.
struct AboutSection: View {
    var body: some View {
        Section("O aplikaci") {
            LabeledContent("Verze") {
                HStack(spacing: 6) {
                    Text("\(Changelog.appVersion) (\(Changelog.buildNumber))")
                    if Changelog.isBeta { BetaBadge() }
                }
            }
            NavigationLink("Co je nového") { ChangelogView() }
        }
    }
}

extension View {
    /// Presents `WhatsNewSheet` once per app version; the last seen version is remembered on the device.
    func whatsNewOnUpdate() -> some View { modifier(WhatsNewModifier()) }
}

private struct WhatsNewModifier: ViewModifier {
    @AppStorage("lastSeenVersion") private var lastSeenVersion = ""
    @State private var release: Release?

    func body(content: Content) -> some View {
        content
            .onAppear {
                guard lastSeenVersion != Changelog.appVersion else { return }
                release = Changelog.current
                lastSeenVersion = Changelog.appVersion
            }
            .sheet(item: $release) { WhatsNewSheet(release: $0) }
    }
}
