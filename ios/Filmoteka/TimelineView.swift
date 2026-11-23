import SwiftUI
import Supabase

/// The user's viewings over time: a month calendar or a month-grouped timeline.
struct TimelineView: View {
    private enum Mode: String, CaseIterable, Identifiable {
        case calendar = "Kalendář"
        case timeline = "Časová osa"
        var id: String { rawValue }
    }

    @State private var viewings: [TimelineViewing] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var mode = Mode.calendar
    @State private var month = DateOnly.firstOfMonth(.now)
    @State private var selectedDay: String? = DateOnly.string(from: .now)

    var body: some View {
        NavigationStack {
            Group {
                switch mode {
                case .calendar: calendarList
                case .timeline: timelineList
                }
            }
            .navigationTitle("Kalendář")
            .navigationDestination(for: TitleSummary.self) { TitleDetailView(title: $0) }
            .safeAreaInset(edge: .top) {
                Picker("Zobrazení", selection: $mode) {
                    ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.vertical, 8)
                .background(.bar)
            }
            .overlay {
                if loaded && viewings.isEmpty && error == nil {
                    ContentUnavailableView(
                        "Zatím nic", systemImage: "calendar",
                        description: Text("Zhlédnutí se tu objeví podle data."))
                }
            }
            .toolbar {
                if mode == .calendar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Dnes") {
                            month = DateOnly.firstOfMonth(.now)
                            selectedDay = DateOnly.string(from: .now)
                        }
                    }
                }
            }
            .refreshable { await load() }
            // also fires when returning from the detail screen, so edits there show up here
            .onAppear { Task { await load() } }
        }
    }

    // MARK: Calendar

    private var calendarList: some View {
        List {
            if let error {
                Text(error).foregroundStyle(.red)
            }
            Section {
                MonthGrid(month: month, byDay: byDay, selectedDay: $selectedDay)
                    .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
            } header: {
                HStack {
                    Button { shiftMonth(-1) } label: {
                        Label("Předchozí měsíc", systemImage: "chevron.left").labelStyle(.iconOnly)
                    }
                    Spacer()
                    Text(DateOnly.month(month)).font(.headline).foregroundStyle(.primary)
                    Spacer()
                    Button { shiftMonth(1) } label: {
                        Label("Další měsíc", systemImage: "chevron.right").labelStyle(.iconOnly)
                    }
                }
                .textCase(nil)
                .padding(.bottom, 4)
            }

            if let selectedDay {
                Section(DateOnly.day(selectedDay)) {
                    let dayViewings = byDay[selectedDay] ?? []
                    if dayViewings.isEmpty {
                        Text("Žádné zhlédnutí").foregroundStyle(.secondary)
                    }
                    ForEach(dayViewings) { v in
                        NavigationLink(value: summary(for: v)) { TimelineRow(viewing: v) }
                    }
                }
            }
        }
    }

    private func shiftMonth(_ delta: Int) {
        month = Self.calendar.date(byAdding: .month, value: delta, to: month) ?? month
        selectedDay = nil
    }

    // MARK: Timeline

    private var timelineList: some View {
        List {
            if let error {
                Text(error).foregroundStyle(.red)
            }
            ForEach(byMonth, id: \.key) { group in
                Section("\(group.label) · \(group.viewings.count)×") {
                    ForEach(group.viewings) { v in
                        NavigationLink(value: summary(for: v)) { TimelineRow(viewing: v) }
                    }
                }
            }
        }
    }

    // MARK: Data

    /// Keyed by "yyyy-MM-dd"; each day keeps the newest-first order of `viewings`.
    private var byDay: [String: [TimelineViewing]] {
        Dictionary(grouping: viewings, by: \.watchedOn)
    }

    /// Newest month first, keyed by "yyyy-MM".
    private var byMonth: [MonthGroup] {
        var groups: [MonthGroup] = []
        for v in viewings {
            let key = String(v.watchedOn.prefix(7))
            if groups.last?.key == key {
                groups[groups.count - 1].viewings.append(v)
            } else {
                let label = DateOnly.date(from: v.watchedOn).map(DateOnly.month) ?? key
                groups.append(MonthGroup(key: key, label: label, viewings: [v]))
            }
        }
        return groups
    }

    private struct MonthGroup {
        let key: String
        let label: String
        var viewings: [TimelineViewing]
    }

    /// Builds the same row the `titles` view would return, from the already loaded viewings (which are all of
    /// the user's viewings, sorted like the view's array_agg), so navigation needs no extra request.
    private func summary(for viewing: TimelineViewing) -> TitleSummary {
        let same = viewings.filter { $0.tmdbId == viewing.tmdbId && $0.mediaType == viewing.mediaType }
        let latest = same.first ?? viewing
        let ratings = same.compactMap(\.rating)
        let avg = ratings.isEmpty
            ? nil : (Double(ratings.reduce(0, +)) / Double(ratings.count) * 10).rounded() / 10
        return TitleSummary(
            mediaType: viewing.mediaType, tmdbId: viewing.tmdbId, title: latest.title,
            posterPath: latest.posterPath, releaseYear: latest.releaseYear, viewCount: same.count,
            lastWatched: latest.watchedOn, avgRating: avg)
    }

    private func load() async {
        do {
            viewings = try await supabase.from("viewings")
                .select("id,tmdb_id,media_type,title,poster_path,release_year,watched_on,rating")
                .eq("user_id", value: try myUserId())
                .order("watched_on", ascending: false)
                .order("id", ascending: false)
                .execute()
                .value
            error = nil
        } catch {
            if !Task.isCancelled { self.error = error.localizedDescription }
        }
        loaded = true
    }

    /// Gregorian, Monday first.
    fileprivate static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.firstWeekday = 2
        return c
    }()
}

/// A viewing with its title info; only the columns this screen needs.
nonisolated private struct TimelineViewing: Decodable, Identifiable, Sendable {
    let id: Int
    let tmdbId: Int
    let mediaType: String
    let title: String
    let posterPath: String?
    let releaseYear: Int?
    let watchedOn: String  // "yyyy-MM-dd"
    let rating: Int?

    enum CodingKeys: String, CodingKey {
        case id, title, rating
        case tmdbId = "tmdb_id"
        case mediaType = "media_type"
        case posterPath = "poster_path"
        case releaseYear = "release_year"
        case watchedOn = "watched_on"
    }
}

private struct MonthGrid: View {
    let month: Date
    let byDay: [String: [TimelineViewing]]
    @Binding var selectedDay: String?

    private static let weekdays = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"]
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)

    /// nil entries pad the first week so the 1st lands on its weekday.
    private var days: [Date?] {
        let cal = TimelineView.calendar
        guard let count = cal.range(of: .day, in: .month, for: month)?.count else { return [] }
        let leading = (cal.component(.weekday, from: month) - cal.firstWeekday + 7) % 7
        let dates = (0..<count).compactMap { cal.date(byAdding: .day, value: $0, to: month) }
        return Array(repeating: nil, count: leading) + dates
    }

    var body: some View {
        LazyVGrid(columns: columns, spacing: 4) {
            ForEach(Self.weekdays, id: \.self) { d in
                Text(d).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
            }
            ForEach(Array(days.enumerated()), id: \.offset) { _, date in
                if let date {
                    let key = DateOnly.string(from: date)
                    DayCell(
                        day: TimelineView.calendar.component(.day, from: date),
                        viewings: byDay[key] ?? [],
                        isToday: TimelineView.calendar.isDateInToday(date),
                        isSelected: selectedDay == key
                    )
                    .contentShape(Rectangle())
                    .onTapGesture { selectedDay = key }
                } else {
                    Color.clear.frame(height: DayCell.height)
                }
            }
        }
    }
}

private struct DayCell: View {
    static let height: CGFloat = 70

    let day: Int
    let viewings: [TimelineViewing]
    let isToday: Bool
    let isSelected: Bool

    var body: some View {
        VStack(spacing: 2) {
            Text("\(day)")
                .font(.caption.weight(isToday ? .bold : .regular))
                .foregroundStyle(isToday ? Color.accentColor : .primary)
            if let first = viewings.first {
                PosterView(path: first.posterPath, size: "w92")
                    .frame(height: 45)
                    .overlay(alignment: .topTrailing) {
                        if viewings.count > 1 {
                            Text("\(viewings.count)")
                                .font(.caption2.bold())
                                .foregroundStyle(.white)
                                .padding(.horizontal, 4)
                                .background(Capsule().fill(Color.accentColor))
                                .offset(x: 6, y: -4)
                        }
                    }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
        .frame(height: Self.height)
        .padding(.top, 4)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(isSelected ? Color.accentColor.opacity(0.18) : .clear))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(viewings.isEmpty ? "\(day)." : "\(day)., \(viewings.count)× zhlédnuto")
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}

private struct TimelineRow: View {
    let viewing: TimelineViewing

    var body: some View {
        HStack(spacing: 12) {
            PosterView(path: viewing.posterPath, size: "w154")
                .frame(width: 46)
            VStack(alignment: .leading, spacing: 4) {
                Text(viewing.releaseYear.map { "\(viewing.title) (\($0))" } ?? viewing.title)
                    .font(.headline)
                Text(DateOnly.day(viewing.watchedOn))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if let rating = viewing.rating {
                    Text("★ \(rating)/10").font(.subheadline)
                }
            }
        }
    }
}
