import SwiftUI
import Supabase

/// One form for both modes, like SleepTrack's form modal:
/// - create: step 1 picks a film/series via TMDB search (skipped when `prefill` is given), step 2 fills in the viewing.
/// - edit (`editing` given): goes straight to step 2 with the stored values.
struct AddViewingView: View {
    private static let other = Places.other
    private static let lastPlaceKey = "lastPlace"
    private static let calendar = Calendar(identifier: .gregorian)

    private enum Precision: String, CaseIterable, Identifiable {
        case day = "Den"
        case month = "Měsíc"
        case year = "Rok"
        var id: String { rawValue }
    }

    @Environment(\.dismiss) private var dismiss
    @Environment(ProfileStore.self) private var profileStore
    @State private var item: TMDBItem?
    private let editing: Viewing?
    /// "Uložit a přidat další" only makes sense when the user picks the title here, not when it is prefilled.
    private let canAddAnother: Bool

    @State private var savedInfo: String?

    /// Called after every successful save (before the sheet dismisses).
    private let onSaved: (() -> Void)?

    @State private var date: Date
    @State private var precision = Precision.day
    /// Before `resolvePlace()` runs: the stored place as is ("" = none).
    @State private var place: String
    @State private var customPlace = ""
    @State private var placeResolved = false
    @State private var rate: Bool
    @State private var rating: Int
    @State private var hasSeason: Bool
    @State private var season: Int
    @State private var note: String
    @State private var saving = false
    @State private var saveError: String?

    init(prefill: TMDBItem? = nil, editing: Viewing? = nil, onSaved: (() -> Void)? = nil) {
        _item = State(initialValue: prefill)
        self.editing = editing
        self.onSaved = onSaved
        canAddAnother = prefill == nil && editing == nil

        // Create mode remembers the last used place, so a batch of old films from one source needs no re-picking.
        _place = State(initialValue: editing?.place ?? UserDefaults.standard.string(forKey: Self.lastPlaceKey) ?? "")
        _date = State(initialValue: editing.flatMap { DateOnly.date(from: $0.watchedOn) } ?? Date())
        _rate = State(initialValue: editing?.rating != nil)
        _rating = State(initialValue: editing?.rating ?? 7)
        _hasSeason = State(initialValue: editing?.season != nil)
        _season = State(initialValue: editing?.season ?? 1)
        _note = State(initialValue: editing?.note ?? "")
    }

    var body: some View {
        NavigationStack {
            Group {
                if let item { form(for: item) } else { searchStep }
            }
            .navigationTitle(editing != nil ? "Upravit zhlédnutí" : item == nil ? "Vybrat titul" : "Zhlédnutí")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Zrušit") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if let item {
                        Button(editing != nil ? "Uložit změny" : "Uložit") {
                            Task { await save(item, addAnother: false) }
                        }
                        .disabled(saving)
                    }
                }
            }
            .onAppear(perform: resolvePlace)
        }
    }

    // MARK: Place

    /// The user's places plus "Jiné" (free text), which is always offered last.
    private var placeOptions: [String] { profileStore.places.filter { $0 != Self.other } + [Self.other] }

    /// Maps the stored place onto the picker once: none picks the first option, an unlisted one becomes "Jiné" + text.
    private func resolvePlace() {
        guard !placeResolved else { return }
        placeResolved = true
        let options = placeOptions
        if place.isEmpty {
            place = options[0]
        } else if !options.contains(place) {
            customPlace = place
            place = Self.other
        }
    }

    // MARK: Step 1

    private var searchStep: some View {
        TMDBSearchView(
            message: savedInfo.map { Text($0).foregroundStyle(.green) },
            onSearch: { savedInfo = nil },
            onPick: { item = $0 })
    }

    // MARK: Step 2

    private var currentYear: Int { Self.calendar.component(.year, from: Date()) }
    private var currentMonth: Int { Self.calendar.component(.month, from: Date()) }

    /// What gets stored: the exact day, the 1st of the month, or January 1st.
    private var storedDate: Date {
        switch precision {
        case .day: date
        case .month: DateOnly.firstOfMonth(date)
        case .year: DateOnly.firstOfYear(date)
        }
    }

    /// Rebuilds `date` from year + month and never lets it land in the future.
    private func setDate(year: Int, month: Int) {
        let built = Self.calendar.date(from: DateComponents(year: year, month: month, day: 1)) ?? date
        date = min(built, Date())
    }

    private var yearBinding: Binding<Int> {
        Binding(
            get: { Self.calendar.component(.year, from: date) },
            set: { setDate(year: $0, month: Self.calendar.component(.month, from: date)) })
    }

    private var monthBinding: Binding<Int> {
        Binding(
            get: { Self.calendar.component(.month, from: date) },
            set: { setDate(year: Self.calendar.component(.year, from: date), month: $0) })
    }

    private var yearPicker: some View {
        Picker("Rok", selection: yearBinding) {
            ForEach((1900...currentYear).reversed(), id: \.self) { Text(String($0)).tag($0) }
        }
    }

    private var monthPicker: some View {
        let names = Locale(identifier: "cs_CZ").calendarMonths
        let selectedYear = Self.calendar.component(.year, from: date)
        return Picker("Měsíc", selection: monthBinding) {
            ForEach(1...(selectedYear == currentYear ? currentMonth : 12), id: \.self) {
                Text(names[$0 - 1]).tag($0)
            }
        }
    }

    private func form(for item: TMDBItem) -> some View {
        Form {
            Section {
                HStack(spacing: 12) {
                    PosterView(path: item.posterPath, size: "w92").frame(width: 50)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.title).font(.headline)
                        Text(item.kindAndYear).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            }

            Section("Kdy") {
                Picker("Přesnost", selection: $precision) {
                    ForEach(Precision.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                switch precision {
                case .day:
                    DatePicker("Datum", selection: $date, in: ...Date(), displayedComponents: .date)
                case .month:
                    yearPicker
                    monthPicker
                case .year:
                    yearPicker
                }
                if precision != .day {
                    LabeledContent("Uloží se jako", value: DateOnly.day(DateOnly.string(from: storedDate)))
                }
            }

            if item.mediaType == "tv" {
                Section("Sezóna") {
                    Toggle("Konkrétní sezóna", isOn: $hasSeason)
                    if hasSeason {
                        Stepper(season == 0 ? "Speciály" : "Sezóna \(season)", value: $season, in: 0...99)
                    }
                }
            }

            Section("Kde") {
                Picker("Kde", selection: $place) {
                    ForEach(placeOptions, id: \.self) { Text($0).tag($0) }
                }
                if place == Self.other {
                    TextField("Kde jinde", text: $customPlace)
                }
            }

            Section("Hodnocení") {
                Toggle("Hodnotit", isOn: $rate)
                if rate {
                    Stepper("★ \(rating)/10", value: $rating, in: 1...10)
                }
            }

            Section("Poznámka") {
                TextField("Poznámka", text: $note, axis: .vertical)
                    .lineLimit(3...6)
            }

            if let saveError {
                Section { Text(saveError).foregroundStyle(.red) }
            }

            if canAddAnother {
                Section {
                    Button("Uložit a přidat další") { Task { await save(item, addAnother: true) } }
                        .disabled(saving)
                }
            }
        }
        .environment(\.locale, Locale(identifier: "cs_CZ"))
    }

    private func save(_ item: TMDBItem, addAnother: Bool) async {
        // a quick double tap starts two tasks before .disabled(saving) re-renders
        guard !saving else { return }
        saving = true
        saveError = nil
        defer { saving = false }

        let chosenPlace = place == Self.other ? customPlace.trimmingCharacters(in: .whitespacesAndNewlines) : place
        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let watchedOn = DateOnly.string(from: storedDate)
        let placeValue = chosenPlace.isEmpty ? nil : chosenPlace
        let ratingValue = rate ? rating : nil
        let noteValue = trimmedNote.isEmpty ? nil : trimmedNote
        // the database rejects a season on movies; batch mode may carry the toggle over from a series
        let seasonValue = item.mediaType == "tv" && hasSeason ? season : nil
        do {
            if let editing {
                try await supabase.from("viewings")
                    .update(
                        ViewingUpdate(
                            watchedOn: watchedOn, place: placeValue, rating: ratingValue, note: noteValue,
                            season: seasonValue)
                    )
                    .eq("id", value: editing.id)
                    .execute()
            } else {
                let row = NewViewing(
                    tmdbId: item.tmdbId,
                    mediaType: item.mediaType,
                    title: item.title,
                    posterPath: item.posterPath,
                    releaseYear: item.releaseYear,
                    watchedOn: watchedOn,
                    place: placeValue,
                    rating: ratingValue,
                    note: noteValue,
                    season: seasonValue)
                try await supabase.from("viewings").insert(row).execute()
                if let placeValue { UserDefaults.standard.set(placeValue, forKey: Self.lastPlaceKey) }
            }
        } catch {
            saveError = error.localizedDescription
            return
        }
        onSaved?()

        if addAnother {
            // keep date, precision and place: old films usually come in batches from the same period/source
            savedInfo = "Uloženo: \(item.title)"
            self.item = nil  // swaps in a fresh TMDBSearchView with an empty query
            note = ""
            rate = false
            rating = 7
        } else {
            dismiss()
        }
    }
}

private extension Locale {
    /// Standalone month names for pickers, e.g. "leden" (the formatted forms would be genitive: "ledna").
    var calendarMonths: [String] {
        var cal = Calendar(identifier: .gregorian)
        cal.locale = self
        return cal.standaloneMonthSymbols
    }
}
