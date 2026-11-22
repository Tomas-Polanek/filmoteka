import SwiftUI
import Supabase

// "Rodina": a user belongs to at most one family (joined by invite code). Members read each other's diary and
// watchlist (RLS); everyone writes only their own rows. Families change only through the RPCs in 0004_family.sql.

/// A row of public.families; RLS shows only the caller's own family.
nonisolated struct Family: Decodable, Identifiable, Sendable {
    let id: UUID
    let name: String
    let inviteCode: String

    enum CodingKeys: String, CodingKey {
        case id, name
        case inviteCode = "invite_code"
    }
}

/// A row of public.family_members; RLS shows only members of the caller's family.
nonisolated struct FamilyMember: Decodable, Identifiable, Hashable, Sendable {
    let userId: UUID
    let displayName: String

    var id: UUID { userId }

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case displayName = "display_name"
    }
}

/// A family member's viewing of one title, for "Rodina viděla" on the title detail.
nonisolated struct FamilyViewing: Decodable, Identifiable, Sendable {
    let id: Int
    let userId: UUID
    let watchedOn: String  // "yyyy-MM-dd"
    let rating: Int?
    let season: Int?

    enum CodingKeys: String, CodingKey {
        case id, rating, season
        case userId = "user_id"
        case watchedOn = "watched_on"
    }
}

nonisolated private struct CreateFamilyParams: Encodable, Sendable {
    let p_name: String
    let p_display_name: String
}

nonisolated private struct JoinFamilyParams: Encodable, Sendable {
    let p_code: String
    let p_display_name: String
}

nonisolated private struct DisplayNameUpdate: Encodable, Sendable {
    let display_name: String
}

/// Members of the caller's family (RLS), oldest first.
private func loadMembers() async throws -> [FamilyMember] {
    try await supabase.from("family_members")
        .select("user_id,display_name")
        .order("joined_at")
        .order("user_id")
        .execute()
        .value
}

private func trimmed(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }

struct FamilyView: View {
    @State private var family: Family?
    @State private var members: [FamilyMember] = []
    @State private var me: UUID?
    @State private var loaded = false
    @State private var error: String?
    @State private var busy = false
    @State private var confirmLeave = false

    // not in a family
    @State private var newFamilyName = ""
    @State private var createName = ""
    @State private var code = ""
    @State private var joinName = ""

    // in a family
    @State private var myName = ""

    var body: some View {
        NavigationStack {
            List {
                if let error {
                    Text(error).foregroundStyle(.red)
                }
                if let family {
                    familySections(family)
                } else if loaded {
                    joinSections
                }
            }
            .navigationTitle(family?.name ?? "Rodina")
            .navigationDestination(for: FamilyMember.self) { MemberView(member: $0) }
            .disabled(busy)
            .overlay { if !loaded { ProgressView() } }
            .task { await load() }
            .refreshable { await load() }
            .alert("Opustit rodinu?", isPresented: $confirmLeave) {
                Button("Opustit", role: .destructive) { Task { await leave() } }
                Button("Zrušit", role: .cancel) {}
            } message: {
                Text("Přestaneš vidět deníky ostatních a oni tvůj. Poslední člen rodinu zruší.")
            }
        }
    }

    // MARK: Not in a family

    @ViewBuilder private var joinSections: some View {
        Section {
            TextField("Název rodiny", text: $newFamilyName)
            TextField("Moje jméno", text: $createName)
                .textContentType(.givenName)
            Button("Založit rodinu") { Task { await create() } }
                .disabled(trimmed(newFamilyName).isEmpty || trimmed(createName).isEmpty)
        } header: {
            Text("Založit rodinu")
        } footer: {
            Text("Ostatní se připojí kódem, který po založení uvidíš tady.")
        }

        Section("Připojit se kódem") {
            TextField("Kód", text: $code)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .font(.body.monospaced())
            TextField("Moje jméno", text: $joinName)
                .textContentType(.givenName)
            Button("Připojit se") { Task { await join() } }
                .disabled(trimmed(code).isEmpty || trimmed(joinName).isEmpty)
        }
    }

    // MARK: In a family

    @ViewBuilder private func familySections(_ family: Family) -> some View {
        Section {
            HStack {
                Text(family.inviteCode)
                    .font(.title2.monospaced().bold())
                    .textSelection(.enabled)
                Spacer()
                Button {
                    UIPasteboard.general.string = family.inviteCode
                } label: {
                    Label("Kopírovat", systemImage: "doc.on.doc")
                }
                .labelStyle(.iconOnly)
                .buttonStyle(.borderless)
            }
            ShareLink(item: "Připoj se do Filmotéky, kód: \(family.inviteCode)") {
                Label("Sdílet kód", systemImage: "square.and.arrow.up")
            }
            Button("Nový kód") { Task { await rotate() } }
        } header: {
            Text("Kód pro pozvání")
        } footer: {
            Text("Kdo má kód, připojí se a uvidí deníky celé rodiny. Nový kód zneplatní ten starý.")
        }

        Section("Moje jméno v rodině") {
            HStack {
                TextField("Moje jméno", text: $myName)
                    .onSubmit { Task { await rename() } }
                if !trimmed(myName).isEmpty && trimmed(myName) != myMember?.displayName {
                    Button("Uložit") { Task { await rename() } }
                        .buttonStyle(.borderless)
                }
            }
        }

        Section("Členové") {
            ForEach(members) { m in
                if m.userId == me {
                    Text("\(m.displayName) (já)")
                } else {
                    NavigationLink(m.displayName, value: m)
                }
            }
        }

        Section {
            Button("Opustit rodinu", role: .destructive) { confirmLeave = true }
        }
    }

    private var myMember: FamilyMember? { members.first { $0.userId == me } }

    // MARK: Actions

    private func load() async {
        do {
            me = try myUserId()
            // RLS shows only the caller's own family
            let families: [Family] = try await supabase.from("families").select().execute().value
            family = families.first
            members = family == nil ? [] : try await loadMembers()
            myName = myMember?.displayName ?? ""
            error = nil
        } catch {
            if !Task.isCancelled { self.error = error.localizedDescription }
        }
        loaded = true
    }

    /// Runs an RPC-backed action, then reloads everything.
    private func perform(_ action: () async throws -> Void) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await action()
            error = nil
        } catch {
            self.error = error.localizedDescription
            return
        }
        await load()
    }

    private func create() async {
        await perform {
            let params = CreateFamilyParams(p_name: trimmed(newFamilyName), p_display_name: trimmed(createName))
            let _: Family = try await supabase.rpc("create_family", params: params).execute().value
            newFamilyName = ""
            createName = ""
        }
    }

    private func join() async {
        await perform {
            let params = JoinFamilyParams(p_code: trimmed(code), p_display_name: trimmed(joinName))
            let _: Family = try await supabase.rpc("join_family", params: params).execute().value
            code = ""
            joinName = ""
        }
    }

    private func rotate() async {
        await perform {
            let _: String = try await supabase.rpc("rotate_invite_code").execute().value
        }
    }

    private func leave() async {
        await perform {
            try await supabase.rpc("leave_family").execute()
        }
    }

    private func rename() async {
        let name = trimmed(myName)
        guard !name.isEmpty, name != myMember?.displayName, let me else { return }
        await perform {
            try await supabase.from("family_members")
                .update(DisplayNameUpdate(display_name: name))
                .eq("user_id", value: me)
                .execute()
        }
    }
}

// MARK: - A member's diary and watchlist (read-only)

struct MemberView: View {
    let member: FamilyMember

    private enum Tab: String, CaseIterable, Identifiable {
        case diary = "Deník"
        case watchlist = "Chci vidět"
        var id: String { rawValue }
    }

    @State private var tab = Tab.diary
    @State private var titles: [TitleSummary] = []
    @State private var watchlist: [WatchlistItem] = []
    @State private var loaded = false
    @State private var error: String?

    var body: some View {
        List {
            Section {
                Picker("Zobrazení", selection: $tab) {
                    ForEach(Tab.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
            if let error {
                Text(error).foregroundStyle(.red)
            }
            switch tab {
            case .diary:
                ForEach(titles) { t in
                    NavigationLink(value: t) {
                        MemberRow(
                            posterPath: t.posterPath, title: t.title, year: t.releaseYear,
                            detail: "×\(t.viewCount) · naposledy \(DateOnly.day(t.lastWatched))",
                            rating: t.avgRating)
                    }
                }
            case .watchlist:
                ForEach(watchlist) { i in
                    MemberRow(
                        posterPath: i.posterPath, title: i.title, year: i.releaseYear,
                        detail: i.mediaType == "tv" ? "Seriál" : "Film", rating: nil)
                }
            }
            TMDBAttribution()
        }
        .navigationTitle(member.displayName)
        .navigationDestination(for: TitleSummary.self) { MemberViewingsView(member: member, title: $0) }
        .overlay {
            if loaded && error == nil {
                switch tab {
                case .diary where titles.isEmpty:
                    ContentUnavailableView("Zatím nic", systemImage: "film")
                case .watchlist where watchlist.isEmpty:
                    ContentUnavailableView("Nic na seznamu", systemImage: "bookmark")
                default:
                    EmptyView()
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            async let titles: [TitleSummary] = supabase.from("titles")
                .select()
                .eq("user_id", value: member.userId)
                .order("last_watched", ascending: false)
                .order("title")
                .execute()
                .value
            async let watchlist: [WatchlistItem] = supabase.from("watchlist")
                .select()
                .eq("user_id", value: member.userId)
                .order("added_at", ascending: false)
                .order("id", ascending: false)
                .execute()
                .value
            (self.titles, self.watchlist) = try await (titles, watchlist)
            error = nil
        } catch {
            if !Task.isCancelled { self.error = error.localizedDescription }
        }
        loaded = true
    }
}

private struct MemberRow: View {
    let posterPath: String?
    let title: String
    let year: Int?
    let detail: String
    let rating: Double?

    var body: some View {
        HStack(spacing: 12) {
            PosterView(path: posterPath, size: "w154")
                .frame(width: 46)
            VStack(alignment: .leading, spacing: 4) {
                Text(year.map { "\(title) (\($0))" } ?? title)
                    .font(.headline)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if let rating {
                    Text("★ \(rating.formatted(.number.precision(.fractionLength(0...1))))")
                        .font(.subheadline)
                }
            }
        }
    }
}

/// A member's viewings of one title, read-only.
private struct MemberViewingsView: View {
    let member: FamilyMember
    let title: TitleSummary

    @State private var viewings: [Viewing] = []
    @State private var error: String?

    var body: some View {
        List {
            if let error {
                Text(error).foregroundStyle(.red)
            }
            Section(member.displayName) {
                ForEach(viewings) { v in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(DateOnly.day(v.watchedOn)).font(.headline)
                            if let season = v.season {
                                Text(seasonLabel(season)).font(.subheadline).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if let rating = v.rating {
                                Text("★ \(rating)/10")
                            }
                        }
                        if let place = v.place, !place.isEmpty {
                            Text(place).font(.subheadline).foregroundStyle(.secondary)
                        }
                        if let note = v.note, !note.isEmpty {
                            Text(note).font(.callout)
                        }
                    }
                }
            }
            TMDBAttribution()
        }
        .navigationTitle(title.title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            viewings = try await supabase.from("viewings")
                .select()
                .eq("user_id", value: member.userId)
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
}

private func seasonLabel(_ season: Int) -> String { season == 0 ? "Speciály" : "Sezóna \(season)" }

// MARK: - "Rodina viděla" on the title detail

/// Other family members' viewings of a title; renders nothing when there are none or the user has no family.
struct FamilyViewingsSection: View {
    let tmdbId: Int
    let mediaType: String

    @State private var model = FamilyViewingsModel()

    var body: some View {
        // Started from body, not .task: a List section without rows never appears, so its .task never runs,
        // and a placeholder row or header to hang it on would leave a visible gap.
        let _ = model.loadIfNeeded(tmdbId: tmdbId, mediaType: mediaType)
        Section {
            ForEach(model.viewings) { v in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(model.names[v.userId] ?? "?").font(.headline)
                        HStack {
                            Text(DateOnly.day(v.watchedOn))
                            if let season = v.season { Text(seasonLabel(season)) }
                        }
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if let rating = v.rating {
                        Text("★ \(rating)/10")
                    }
                }
            }
            if let error = model.error {
                Text(error).foregroundStyle(.red)
            }
        } header: {
            if !model.viewings.isEmpty || model.error != nil { Text("Rodina viděla") }
        }
    }
}

@MainActor @Observable
private final class FamilyViewingsModel {
    private(set) var viewings: [FamilyViewing] = []
    private(set) var names: [UUID: String] = [:]
    private(set) var error: String?
    @ObservationIgnored private var loadedKey: String?

    /// Loads once per title; safe to call on every body evaluation (touches no observed state synchronously).
    func loadIfNeeded(tmdbId: Int, mediaType: String) {
        let key = "\(mediaType)-\(tmdbId)"
        guard key != loadedKey else { return }
        loadedKey = key
        Task { await load(tmdbId: tmdbId, mediaType: mediaType) }
    }

    private func load(tmdbId: Int, mediaType: String) async {
        do {
            // RLS limits other users' rows to the caller's family; none without a family
            let rows: [FamilyViewing] = try await supabase.from("viewings")
                .select("id,user_id,watched_on,rating,season")
                .neq("user_id", value: try myUserId())
                .eq("tmdb_id", value: tmdbId)
                .eq("media_type", value: mediaType)
                .order("watched_on", ascending: false)
                .order("id", ascending: false)
                .execute()
                .value
            if !rows.isEmpty {
                names = Dictionary(uniqueKeysWithValues: try await loadMembers().map { ($0.userId, $0.displayName) })
            }
            viewings = rows
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
