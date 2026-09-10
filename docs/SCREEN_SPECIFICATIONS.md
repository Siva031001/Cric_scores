# CricketScorer — Screen-by-Screen Field & Option Specification

> Every screen, every field, every option value — copied verbatim from source.
> Labels, placeholders, button text and error messages are exact strings as the user sees them.
> Version: generated 2026-09-10 · 25 screens · React Native + Firebase Realtime Database

---

## Navigation Map (25 screens)

| Group | Screen (route name) | File |
|---|---|---|
| Auth | `Login` | `src/screens/auth/LoginScreen.tsx` |
| Auth | `ForgotPassword` | `src/screens/auth/ForgotPasswordScreen.tsx` |
| Home | `Home` | `src/screens/home/HomeScreen.tsx` |
| Match | `NewMatch` | `src/screens/match/NewMatchScreen.tsx` |
| Match | `PlayerSetup` | `src/screens/match/PlayerSetupScreen.tsx` |
| Match | `BattingSetup` | `src/screens/match/BattingSetupScreen.tsx` |
| Match | `Scoring` | `src/screens/match/ScoringScreen.tsx` |
| Match | `Scorecard` | `src/screens/match/ScorecardScreen.tsx` |
| Match | `History` | `src/screens/match/HistoryScreen.tsx` |
| Match | `LiveView` | `src/screens/match/LiveViewScreen.tsx` |
| Match | `PublicMatch` | `src/screens/match/PublicMatchScreen.tsx` |
| Streaming | `LiveStream` | `src/screens/match/LiveStreamScreen.tsx` |
| Streaming | `MyLiveStreams` | `src/screens/match/MyLiveStreamsScreen.tsx` |
| Streaming | `StreamingPlans` | `src/screens/match/StreamingPlansScreen.tsx` |
| Streaming | `StreamingDashboard` | `src/screens/match/StreamingDashboardScreen.tsx` |
| Streaming | `ThemeSelector` | `src/screens/match/ThemeSelectorScreen.tsx` |
| Streaming | `CameraMode` | `src/screens/match/CameraModeScreen.tsx` |
| Stats | `MyMatches` | `src/screens/stats/MyMatchesScreen.tsx` |
| Stats | `MatchHistoryDetail` | `src/screens/stats/MatchHistoryDetailScreen.tsx` |
| Teams | `CreateTeam` | `src/screens/teams/CreateTeamScreen.tsx` |
| Teams | `MyTeams` | `src/screens/teams/MyTeamsScreen.tsx` |
| Teams | `TeamDetail` | `src/screens/teams/TeamDetailScreen.tsx` |
| Tournament | `MyTournament` | `src/screens/tournament/MyTournamentScreen.tsx` |
| Tournament | `TournamentDetail` | `src/screens/tournament/TournamentDetailScreen.tsx` |
| Tournament | `CreateTournament` | `src/screens/tournament/CreateTournamentScreen.tsx` |
| Tournament | `TournamentLeaderboard` | `src/screens/tournament/LeaderboardScreen.tsx` |
| Tournament | `JoinAsCaptain` | `src/screens/tournament/JoinAsCaptainScreen.tsx` |
| Tournament | `TournamentInvitePreview` | `src/screens/tournament/TournamentInvitePreviewScreen.tsx` |
| Settings | `Profile` | `src/screens/settings/ProfileScreen.tsx` |
| Settings | `ProfileEdit` | `src/screens/settings/ProfileEditScreen.tsx` |
| Settings | `Settings` | `src/screens/settings/SettingsScreen.tsx` |

**App entry:** 2-second splash (`CricketScorer` / `Your cricket companion`), then `initialRouteName` = `Home` if a valid stored session exists, else `Login`.

**Session enforcement:** one active device per phone. If the same number logs in elsewhere, this device gets alert `Logged Out` / `This account was signed in on another device, so you've been logged out here.` and is reset to `Login`.

---

# 1. LOGIN SCREEN (`Login`)

Single screen, 5 modes: `phone` → `verify-otp` → `setup-pin` → `confirm-pin` (new user), or `phone` → `login-pin` (existing user).

**Static chrome:** 🏏 icon · `CricketScorer` · `Score every ball, track every match`

### Card title / subtitle per mode

| Mode | Title | Subtitle |
|---|---|---|
| `phone` | `Login with Mobile` | `Enter your 10-digit mobile number` |
| `verify-otp` | `Verify your number` | `Enter the OTP sent to +91 <phone>` |
| `setup-pin` | `Create a PIN` | `Set a 4-6 digit PIN for +91 <phone>` |
| `confirm-pin` | `Confirm your PIN` | `Re-enter your PIN to confirm` |
| `login-pin` | `Enter your PIN` | `Enter your PIN for +91 <phone>` |

### Fields

| Mode | Placeholder | Keyboard | Max | Secure | Notes |
|---|---|---|---|---|---|
| `phone` | `Enter mobile number` | phone-pad | 10 | – | Prefix box shows 🇮🇳 `+91` |
| `verify-otp` | `Enter OTP` | number-pad | 6 | – | Centred, letter-spacing 12 |
| `setup-pin` | `Set 4-6 digit PIN` | number-pad | 6 | ✅ | |
| `confirm-pin` | `Re-enter PIN` | number-pad | 6 | ✅ | |
| `login-pin` | `Enter PIN` | number-pad | 6 | ✅ | |

### Buttons

| Mode | Button | Action |
|---|---|---|
| `phone` | `Continue` | Check if number registered → route to PIN login or send OTP |
| `verify-otp` | `Verify OTP` | Confirm OTP code |
| `verify-otp` | `Resend OTP in <n>s` → `Resend OTP` | 30-second cooldown |
| `verify-otp` | `Change Number` | Back to `phone` |
| `setup-pin` | `Next` | Store first PIN, go to confirm |
| `setup-pin` | `Change Number` | Back to `phone` |
| `confirm-pin` | `Create Account` | Create account → `Home` |
| `confirm-pin` | `Back` | Back to `setup-pin` |
| `login-pin` | `Login` | PIN login → `Home` |
| `login-pin` | `Forgot Password?` | → `ForgotPassword` |
| `login-pin` | `Change Number` | Back to `phone` |

### Validation messages

| Condition | Title | Message |
|---|---|---|
| Phone ≠ 10 digits | `Invalid Number` | `Please enter a valid 10-digit mobile number.` |
| OTP blank / < 4 chars | `Error` | `Enter the code you received` |
| Wrong OTP | `Error` | `Incorrect or expired code. Please try again.` |
| PIN not 4-6 digits | `Invalid PIN` | `PIN must be 4 to 6 digits.` |
| PINs differ | `PIN Mismatch` | `The PINs you entered don't match. Please try again.` |
| Wrong PIN on login | `Login Failed` | `Incorrect PIN. Please try again.` |
| Unregistered number | `Login Failed` | `No account found for this number. Please set up a PIN first.` |

**Footer:** `Logging in here will sign you out of any other device.` (login-pin mode) · else `By continuing, you agree to our Terms of Service`

---

# 2. FORGOT PASSWORD SCREEN (`ForgotPassword`)

3 steps: `phone` → `otp` → `newPin`. Header: `Forgot Password`

### Fields

| Step | Label | Placeholder | Keyboard | Max | Secure |
|---|---|---|---|---|---|
| `phone` | `Enter your registered mobile number` | `10-digit mobile number (no +91, no spaces)` | phone-pad | – | – |
| `otp` | `Enter the OTP sent to <phone>` | `6-digit code` | number-pad | – | – |
| `newPin` | `Set a new PIN` | `New PIN (4-6 digits)` | number-pad | 6 | ✅ |
| `newPin` | (same label) | `Confirm New PIN` | number-pad | 6 | ✅ |

**Attempts counter (otp step):** `<n> attempts remaining` when below 5, else `Valid for 15 minutes`

### Buttons

| Step | Button |
|---|---|
| `phone` | `Send OTP` |
| `otp` | `Verify OTP` · `Resend OTP in <n>s` / `Resend OTP` · `Change phone number` |
| `newPin` | `Reset PIN` |

### Validation messages

| Condition | Title | Message |
|---|---|---|
| Not 10 digits | `Error` | `Please enter your 10-digit mobile number (the same one you used to log in, without +91 or spaces)` |
| Cooldown active | `Please Wait` | `You can request another OTP in <n>s.` |
| Daily cap hit | `Limit Reached` | `You have reached the maximum OTP request limit for today. Please try again after 24 hours.` |
| No account | `Error` | `No account found for this number.` |
| Wrong OTP | `Incorrect Code` | `Wrong OTP. <n> attempts remaining before you'll need a new code.` |
| 5 wrong attempts | `Too Many Attempts` | `This code is no longer valid after 5 incorrect attempts. Please request a new OTP.` |
| PIN format bad | `Error` | `PIN must be 4-6 digits` |
| PINs differ | `Error` | `PINs do not match` |
| Success | `Success` | `Your PIN has been reset. Please log in with your new PIN.` |
| SMS not enabled | `Error` | `SMS service is not enabled for this app yet. Please contact support.` |
| Quota exceeded | `Error` | `SMS quota exceeded for today. Please try again tomorrow.` |

**Rate limits:** 3 OTPs per 24 hours · 30-second resend cooldown · 5 verification attempts per code
**Ad gate:** 1st OTP of the day is free; 2nd and 3rd require watching a rewarded ad. Skipping shows `Ad Skipped` / `Please watch the complete advertisement to receive another OTP.`

---

# 3. HOME SCREEN (`Home`)

### Top bar
- Avatar (photo or initials) · `Welcome back,` · profile name
- Settings icon → `Settings`

### Search box
Placeholder: `Search team, player, venue...`
Searches across **My Teams** (name), **Matches** (team1 / team2 / venue) and **Public Tournaments** (name / organisation / venue). Result rows carry a type badge (Team / Match / Tournament). No match → `No results for <query>`

### Live Matches section (only when live matches exist)
`🔴 Live Matches` — cards show `Team1 vs Team2`, both innings scores, hint `Tap to continue →` → `Scoring`

### Tournament discovery
Section: `Discover Tournaments`
Filter chips: `All` · `Live Now` · `Upcoming` · `Completed` · `My Tournaments`
Horizontal carousel of tournament posters → `TournamentDetail`

### Featured button
`🏏 Start New Match` / `Score and track live` → `NewMatch`

### Main menu grid (8 tiles)

| Icon | Label | Sub-label | Destination |
|---|---|---|---|
| 📊 | `My Matches` | `Stats & Overview` | `MyMatches` |
| 👥 | `Teams` | `My & Other Teams` | `MyTeams` |
| 🏆 | `My Tournaments` | `View tournaments` | `MyTournament` |
| ➕ | `Create Tournament` | `Organise a tournament` | `CreateTournament` |
| ✉️ | `Join as Captain` | `Enter a tournament invite code` | `JoinAsCaptain` |
| 📋 | `Match History` | `Detailed stats per match` | `MatchHistoryDetail` |
| 📡 | `YouTube Live` | `Stream live match` | `LiveStream` |
| ⚙️ | `Settings` | `Profile & preferences` | `Settings` |

Ad banner pinned at bottom.

---

# 4. NEW MATCH SCREEN (`NewMatch`)

Header: `New Match` · right button `My Teams`

### Fields & options

| Field | Type | Options / Placeholder | Notes |
|---|---|---|---|
| Team 1 logo | Tap-to-pick circle | `+` when empty | Opens `CreateTeam` prefilled |
| Team 1 name | TextInput | `Team Name` | On blur → team lookup |
| Team 2 logo | Tap-to-pick circle | `+` when empty | |
| Team 2 name | TextInput | `Team Name` | On blur → team lookup |
| Quick Select | Row per saved team | Buttons `Team 1` / `Team 2` | Section title `Quick Select from My Teams` |
| `📍 Venue (Optional)` | TextInput | `Enter venue` | |
| `🕐 Overs` | Chips + free input | **`5` · `10` · `15` · `20` · `50`** + `Other` (numeric, max 3 digits) | Default `20` |
| `🏏 Ball Type` | Chips | **`Leather Ball` · `Tennis Ball` · `Turf`** | Default `Tennis Ball` |
| `Players Per Side` | Chips — **only shown when Ball Type = `Turf`** | **`4` · `5` · `6` · `7` · `8` · `9` · `10` · `11`** | Default `11`; non-Turf is forced to 11 |

**Start button:** `🏏 Start Match`

### Team lookup feedback
- Found → alert `✅ Team Found!` / `"<name>" loaded with <n> players.` and status line `✅ <n> players`
- Not found → alert `Team Not Found` / `"<name>" is not in your teams. Create it?` with buttons `Cancel` · `Create Team`

### Validation

| Condition | Message |
|---|---|
| Either team name blank | `Please enter both team names` |
| Team 1 not loaded | `Search or create team "<name>" first` |
| Team 2 not loaded | `Search or create team "<name>" first` |
| Overs < 1 | `Please enter valid overs` |

---

# 5. PLAYER SETUP SCREEN (`PlayerSetup`)

Two phases: `playing11` then `toss`. Header title switches `Playing 11` → `Toss`

### Phase 1 — Playing 11
- Two tabs: Team 1 name with counter `<n>/11`, Team 2 name with counter `<n>/11`
- Hint: `Select 11 players for <TeamName> (<n>/11)`
- Player rows: avatar initials · name · role · `(C)` / `(WK)` badges · checkbox
- Required count = `playersPerSide` (11, or 4–11 for Turf)
- Button: `Next: <OtherTeam> Playing 11 →` then `Continue to Toss →`
- Over-selection alert: `<Name>: Select exactly 11. Selected: <n>`

### Phase 2 — Toss

| Field | Options |
|---|---|
| `🪙 Who won the toss?` | Team 1 name · Team 2 name |
| `<Winner> chose to...` | **`🏏 Bat`** · **`🎯 Bowl`** |

Result line: `<Winner> won toss and chose to <choice>. <Other> will bat first.`
Button: `Start Match →`

---

# 6. BATTING SETUP SCREEN (`BattingSetup`)

Header: `Match Setup`

- Toss summary: `🪙 <Winner> won toss • chose to <choice>` and `🏏 <BattingTeam> batting first`
- Teams card: `BATTING` / `VS` / `BOWLING`
- Selection summary row: `🏏 Striker` · `🏃 Non-Str` · `🎯 Bowler` (value or `—`)

### Three tabs (auto-advance on selection)

| Tab | Roster shown |
|---|---|
| `🏏 Striker <BattingTeam>` | Batting team playing XI |
| `🏃 Non-Striker <BattingTeam>` | Batting team, striker excluded |
| `🎯 Bowler <BowlingTeam>` | Bowling team playing XI |

**Button:** `🏏 Start Match!` (shows `Starting...` while creating)
Creates the match in Firebase, then replaces the screen with `Scoring`.

---

# 7. SCORING SCREEN (`Scoring`) — the core screen

Header: `<Team1> vs <Team2>` · Live toggle button · back → exit confirmation

### Live stream bar (when Live is on)
- Not streaming: `+ Add Stream URL`
- Streaming: red dot · truncated URL · `View` · `Stop` · `Share ID`

### Scoreboard card
- `<Team> innings`
- Big score `<runs>/<wickets>`
- `<overs>.<balls>/<totalOvers> ov`
- `RR <run rate>`
- 2nd innings only: `Need <n> off <n> balls` and `RRR: <rate>`
- Ball history pills (last 6), colour-coded: wicket = red, `4` = blue, `6` = yellow

### Players card
- Striker: `*<Name>` + `<runs>(<balls>)`
- Non-striker: `<Name>` + `<runs>(<balls>)`
- Bowler: `<Name>` + `<overs>.<balls>-<runs>-<wickets>`
- `Extras <total> (W:<n> NB:<n> B:<n> LB:<n>)`

### Conditional banners
| Banner | Text |
|---|---|
| Bye mode active | `<B\|LB> — tap a run button` + `Cancel` |
| Free hit | `FREE HIT` / `Batsman cannot be dismissed (except run out)` |
| Completed | `Match Completed — <winner>` + `View Scorecard` |

### Run buttons (6)
**`0` · `1` · `2` · `3` · `4` · `6`** — `4` styled blue, `6` styled yellow. (No `5` button; 5 runs come via extras.)

### Extras buttons (6)

| Button | Behaviour |
|---|---|
| `WD` | Opens Wide runs modal |
| `NB` | Opens No-ball runs modal |
| `B` | Toggles Bye mode — then tap a run button |
| `LB` | Toggles Leg-bye mode — then tap a run button |
| `OUT` | Opens wicket type modal |
| `PTY` | Opens penalty runs modal |

### Bottom bar (3)
`Undo` · `Share` · `Scorecard`

### Modal: Wide runs
Title `Wide — Select Runs` · Hint `1 wide run always added. Select extra runs scored.`
Options: **`0` `1` `2` `3` `4` `5`** — each tile shows `= <n+1>` total. `Cancel`

### Modal: No-ball runs
Title `No Ball — Select Runs` · Hint `1 no ball run always added. Select bat/extra runs scored.`
Options: **`0` `1` `2` `3` `4` `5` `6`** — each tile shows `= <n+1>` total. `Cancel`

### Modal: Penalty runs
Title `Penalty Runs` · Preset chips **`1` `2` `3` `4` `5`** + free numeric input (default `5`) · Buttons `Cancel` · `Add`

### Modal: Wicket type
Title `How Out?` · Options (7):
**`Bowled` · `Caught` · `LBW` · `Run Out` · `Stumped` · `Hit Wicket` · `Retired`** · `Cancel`

Routing after selection:
- `Caught` / `Stumped` → fielder picker, title `<Type> — Select Fielder`, footer `Skip`
- `Run Out` → 3 sub-steps: `Run Out — Who is Out?` (striker / non-striker) → runs completed (0–3) → `Run Out — Select Fielder`
- All others → applied immediately

### Overlay: Next batsman
Title `Wicket — Next Batsman` — lists not-out players excluding both current batters, with `(C)` / `(WK)` suffixes.

### Overlay: New bowler
Player list from bowling side with `(C)` suffix.

### Modal: Innings over
Title `Innings Over!` · `<Team>: <runs>/<wickets>` · 1st innings adds `<Team2> needs <n> to win`
Note: `You can Undo last ball before proceeding`
Buttons — 1st innings: `Undo Last Ball — Stay Here` · `Start 2nd Innings` · `View 1st Innings Scorecard`
Buttons — 2nd innings: `View Scorecard` · `Go to Home`

### Modal: Leave scoring
Title `Leave Scoring?` · Body `Are you sure you want to exit scoring?` / `Match is still in progress.`
Buttons: `End / Abandon Match` · `View Scorecard` · `Back to Scoring`

### Modal: End reason
Title `Select Reason` · Options (6):
**`Pause Match` · `Match Abandoned` · `Network Issue` · `Bad Weather` · `Pitch Issue` · `Other Reason`** · `Continue Scoring`

### Modal: Add live stream
Title `Add Live Stream` · Body `Start a YouTube Live stream first, then paste the URL here`
Field label `Stream URL`, placeholder `https://youtube.com/watch?v=... or RTMP URL`
Help box:
```
How to go live:
1. Open YouTube app
2. Tap + → Go Live
3. Copy the live stream URL
4. Paste it above and tap Add Stream
```
Buttons: `Cancel` · `Add Stream`

### Video overlay
Embedded player + live score bar: `LIVE` · `ID: <matchId>` · teams · big score · overs · `RR` · `Need <n>` · striker/bowler lines · last 6 balls.

### Automatic behaviour
- Strike rotates automatically on odd runs and at end of over
- Over completes at 6 legal balls; wides and no-balls do not count as legal
- Byes / leg-byes count the ball but are not charged to the bowler
- Free hit clears on the next legal delivery
- All-out threshold = `playersPerSide − 1`
- Innings ends on all-out or overs complete; chase ends the moment the target is passed
- Tournament matches automatically update standings, NRR and knockout progression on completion

---

# 8. SCORECARD SCREEN (`Scorecard`)

Header: `Scorecard`

- Teams row `<Team1>` `VS` `<Team2>` · `Venue: <venue>`
- Result box, e.g. `Team1 won by 5 runs` / `Team2 won by 3 wickets` / `Match tied`
- Status badge + `ID: <matchId>`
- Score summary boxes per innings: runs/wickets, overs, RR, target

### AI summary box
Header `🤖 AI MATCH SUMMARY`
States: existing text · `Generating summary...` · button `✨ Generate AI Summary`
Ad gate modal — title `🤖 Generate AI Summary`, body `AI Generation uses premium resources. Please watch a short advertisement to continue.`, buttons `Watch Ad & Continue` · `Cancel`

### Innings tabs
`<Team1> (1st)` · `<Team2> (2nd)`

### Batting table columns
`Batter` · `R` · `B` · `4s` · `6s` · `SR`
Dismissal text per row: `c <Fielder> b <Bowler>` / `lbw` / `Run Out` / `not out`
Highlighting: 50+ yellow, 100+ primary
Below: `Yet to Bat` with `(C)` / `(WK)` markers

### Extras line
`Extras: <total> (W:<n> NB:<n> B:<n> LB:<n> PTY:<n>)`

### Bowling table columns
`Bowler` · `O` · `R` · `W` · `Eco` · `WD` · `NB`
3+ wickets highlighted red/bold

### Man of the Match
Auto-prompt modal — title `🏆 Man of the Match`, subtitle `Select from top 2 performers`
Each candidate card shows avatar, name, team and inline stat lines `🏏 50(25)` · `🎯 2/15` · `🧤 2 Catches`
Buttons: `Confirm as Man of the Match` · `Skip`
Once set, a banner shows `MAN OF THE MATCH` with name, team and all three stat lines.

**Scoring formula (auto-ranking):**
- Batting: runs + fours + (sixes × 2) + 25 if century + 10 if fifty + 5 if not out
- Bowling: (wickets × 15) + 5 if economy < 6 (or 2 if < 8) + (maidens × 3)
- Fielding: (catches × 8) + (stumpings × 8) + (run-outs × 6)

### Buttons
`Share Scorecard` · plus one context button: `Back to Scoring — Start 2nd Innings There` / `Back to Scoring` / `Continue Scoring` / `🏠 Back to Home`

---

# 9. CREATE TEAM SCREEN (`CreateTeam`)

Header: `Create Team` or `Edit Team` · right `Save` / `Saving...`
Also used for captain squad submission (`captainInviteMode`).

### Team-level fields

| Field | Type | Options / Placeholder |
|---|---|---|
| Logo | Tap circle | 📷 + `Add Logo` → alert `Team Logo` / `Choose photo source` → `Camera` · `Gallery` · `Cancel` |
| Team name | TextInput | Placeholder `Team Name *`, auto-capitalise words. **Read-only in captain-invite mode** |
| Team type | Toggle (hidden when editing) | **`My Team`** · **`Other Team`** (stored as `my` / `other`) |
| Captain pill | Status text | `Set Captain *` → `C: <name>` |
| Wicket-keeper pill | Status text | `Set WK *` → `WK: <name>` |

Section header: `Players (<filled>/15) — Min 11 required`
Hint: `C = Captain   WK = Keeper   +/- = Details`

### Per-player row (15 fixed slots)

| Field | Type | Options / Placeholder |
|---|---|---|
| Row number | Badge | `1`–`15` |
| Phone number | TextInput | Placeholder `Phone number *` (rows 1–11) or `Phone number` (rows 12–15) · phone-pad · max 10 digits · lookup fires on blur |
| Name | Text or link | Shows name, or tappable `Edit Name`. **Only appears after a phone lookup** |
| `C` | Toggle | Sets captain (tap again to clear) |
| `WK` | Toggle | Sets wicket-keeper (tap again to clear) |
| `+` / `-` | Toggle | Expands the detail panel (one row at a time) |

**Phone lookup status line (one of):**
- `Checking phone number...`
- `✓ Linked to registered account`
- `No account yet — playing as guest`

### Expanded detail panel

| Label | Type | Exact options |
|---|---|---|
| `Role` | Chips | **`Batter` · `Bowler` · `Wicket Keeper` · `All Rounder`** (default `Batter`) |
| `Batting Style` | Chips | **`Right Hand` · `Left Hand`** (default `Right Hand`) |
| `Bowling Style` | Free text | Placeholder `e.g. Right Arm Fast` — no preset list |

### Modal: display name
Title `Enter Display Name`
Body `This is a temporary name for this match only — it will be replaced automatically once this number registers.`
Field placeholder `e.g. King` · Button `Save Name`
Validation: blank → `Please enter a display name`; special characters → `Invalid Name` / `Only letters and numbers are allowed. Special characters are not permitted.`

### Phone lookup alerts

| Condition | Title | Message |
|---|---|---|
| Number already used in this team | `Duplicate Number` | `This phone number is already used by another player in this team.` |
| Number not registered | `No Account Found` | `This phone number has not been registered. Stats will not be permanently tracked until this phone number creates an account.` |
| Lookup failed | `Error` | `Could not check phone number: <reason>` |

### Save validation (in order)

| # | Condition | Message |
|---|---|---|
| 1 | Team name blank | `Please enter team name` |
| 2 | No captain | `Please select a Captain (tap C button)` |
| 3 | No wicket-keeper | `Please select a Wicket Keeper (tap WK button)` |
| 4 | Fewer than 11 complete players | `Enter phone number + name for at least 11 players (<n> entered)` |
| 5 | Captain has no name | `Captain must have a name` |
| 6 | WK has no name | `Wicket Keeper must have a name` |
| 7 | Rosters locked (captain mode) | `Team Locked` / `The organizer has locked team rosters — players can no longer be added or changed.` |

### Success alerts
- New team → `Saved!` / `"<Name>" saved as My Team.`
- Edit → `Updated!` / `"<Name>" updated.`
- Captain submission → `Submitted!` / `Your squad for "<Team>" has been submitted to the organizer.`

**Footer button:** `Save Team` / `Update Team` / `Saving...`

**Player identity rule:** registered = phone found in the account directory (stats tracked permanently); guest = phone not yet registered (stats provisional, auto-linked when that number later registers). This is derived automatically — not user-selectable.

---

# 10. MY TEAMS SCREEN (`MyTeams`)

Header: `Teams` (or `Select Team for Tournament` in select mode) · right `+ New`

**Tabs:** `My Teams (<n>)` · `Other Teams (<n>)`
Card: logo/initial · team name · badge `My Team` / `Other` · `<n> players • C: <captain>`
Row buttons: `Edit` · `Del`
Tapping a card → `TeamDetail` (or selects it, in tournament select mode)

**Delete confirmation:** `Delete Team` / `Delete "<name>"?` → `Cancel` · `Delete`
**Add-to-tournament alerts:** `Already Added` / `<team> is already in this tournament` · `Added!` / `<team> added with <n> players`
**Empty state:** `No My Teams yet` / `Create teams you play in` (or `No Other Teams yet` / `Add opponent or other teams`) + `+ Create Team`

---

# 11. TEAM DETAIL SCREEN (`TeamDetail`)

Read-only. Header: `Team Details`

- Team logo (or first letter) · team name · `<n> Players`
- Key player boxes: `Captain` (👑) and `Wicket Keeper` (🧤) — value or `Not set`
- `Squad (<n>)` list — each row: avatar · name · `C` / `WK` badges · `<Role> • <Batting Style> bat • <Bowling Style>`
- Not-found state: `Team not found`

---

# 12. CREATE TOURNAMENT SCREEN (`CreateTournament`)

3-step wizard with progress indicator: `Details` → `Teams` → `Schedule`

### Step 1 — Details

| Label | Type | Options / Placeholder |
|---|---|---|
| `Tournament Name *` | TextInput | `Tournament name` |
| `Organisation Name *` | TextInput | `Club / Organisation` |
| `Venue` | TextInput | `Main venue` |
| `Start Date` | TextInput | `DD/MM/YYYY` (defaults to today) |
| `End Date` | TextInput | `DD/MM/YYYY` |
| — | Hint | `Only today or future dates allowed` |
| `Ball Type` | Chips | **`Red Ball - Leather Ball`** · **`Tennis Ball - Tennis Ball`** (values `Leather Ball` / `Tennis Ball`) |
| `Tournament Format *` | Chips | **`League` · `Knockout` · `Pool + Knockout`** |
| `Match Format (Overs)` | Chips | **`6 Overs` · `8 Overs` · `20 Overs` · `50 Overs` · `Others`** |
| Custom overs | TextInput — only when `Others` | `Enter overs e.g. 15` (numeric) |

Pool + Knockout hint: `You'll set up pools, assign teams, and configure qualification after creating the tournament — from the new "Pools" tab.`

**Button:** `Create Tournament` / `Creating...` — creates immediately and jumps to `TournamentDetail` (steps 2–3 are optional and can be done later in the detail screen)

Validation: name or organisation blank → `Fill required fields`

### Step 2 — Teams
Section `Teams (<n>)` · button `+ Add Team` · empty box `Add at least 2 teams`
Modal `Add Team` with placeholder `Team name`, buttons `Cancel` · `Add`
Footer: `Back` · `Next: Schedule`

### Step 3 — Schedule
Section `Matches (<n>)` · button `+ Schedule` · empty box `No matches scheduled yet`
Modal `Schedule Match`:

| Label | Type | Options |
|---|---|---|
| `Team 1 *` | Chips | Tournament teams |
| `Team 2 *` | Chips | Tournament teams (must differ) |
| `Date (DD/MM/YYYY)` | TextInput | Defaults to today |
| `Time` | TextInput | `e.g. 10:00 AM` |
| `Venue (optional)` | TextInput | Falls back to tournament venue |

Validation: `Select both teams` · `Teams must be different` · `Invalid Date` / `Cannot schedule in the past`
Footer: `Back` · `Create Tournament`

---

# 13. TOURNAMENT DETAIL SCREEN (`TournamentDetail`) — organiser hub

Header: tournament name · info · edit · delete
Info bar: 🏢 organisation · 📍 venue · 🏏 ball type + format

**Tabs:** `Matches` · `Teams` · `Pools` (Pool + Knockout only) · `Bracket` (non-League only) · `Points` · `Stats`

## Tab: Matches
- Button `+ Schedule New Match` (needs ≥ 2 teams)
- Match card: teams, date/time/venue, status badge `Scheduled` / `Live` / `Done`
- Buttons by state: `Start Match` · `Continue` · `Scorecard` · `Remove` · `Assign Scorer`
- Two-step scheduling: team selection, then date/time/venue

## Tab: Teams

**Team Lock section** — chips:
| Chip label | Meaning |
|---|---|
| `Manual` | Organiser locks/unlocks by hand |
| `On Tournament Start` | Locks when the tournament goes live |
| `After League/Pool Stage` | Locks once all pool/league matches finish |
| `Before Knockout` | Locks as soon as knockout fixtures exist |

Manual-mode toggle button: `🔓 Unlocked — Tap to Lock` ⇄ `🔒 Locked — Tap to Unlock`

- Button `+ Add Team from My Teams`
- Button `+ Invite Team Captain`
- Team card: initials avatar · name · `P` / `W` / `L` / `Pts` · captain-invite status · remove `✕`
- Registration status values: `pending` · `playersAdded` · `complete` · `locked` (complete = 11+ players)
- Progress label: `<n> / 11 players`

## Tab: Pools
- Button `+ Create Pool`
- Modal fields: pool name, and `Qualify to Knockout` chips **`Top 1` · `Top 2` · `Top 4`** (default `Top 2`)
- Per pool: `Qualifies: Top <n> • <n> teams`
- Team list with `Remove`, plus chips to add unassigned teams
- Button `+ Schedule Pool Match`
- Pool match rows with `Start` / `Continue` / `Result`
- **Pool standings columns:** team name (prefixed `✓ ` if qualifying) · `P` · `W` · `L` · `NRR` · `Pts` — qualifying rows outlined yellow
- `Qualified Teams` summary block
- Pool actions: `Rename` · `Delete`

## Tab: Bracket
- Locked state: `Bracket Locked` until every pool match is complete
- Empty state hint: `Auto-generate from pool qualifiers, or build manually`
- Buttons: `+ Auto-Generate` · `+ Add Match Manually`
- Stage order displayed: **`Round of 16` → `Quarter Final` → `Semi Final` → `Third Place Match` → `Final`**
- Manual fixture stages selectable: **`Quarter Final` · `Semi Final` · `Final` · `Third Place Match`**
- Fixture card: home vs away (or `Pool A #1 vs Pool B #2` placeholder), date/time, status
- Fixture actions: `Start` · `Continue` · `Edit` (scheduled only) · `Scorecard`
- Winners auto-populate the next round's slot

**Auto-generation rules:** requires all pool matches complete; takes each pool's top N by Points then NRR; seeds rank 1 against a rank 2 from a *different* pool; builds every later round as placeholder slots; optional third-place match.

## Tab: Points
Leaderboard table — see Leaderboard screen for column list.

## Tab: Stats
Sub-tabs `Batting` · `Bowling` · `Fielding` — aggregated across league, pool and knockout matches, keyed by global player identity so the same person accumulates across teams.

## Captain invite flow (organiser side)
`+ Invite Team Captain` → enter team name → `Generate Invite` → 6-character code → `📤 Share via WhatsApp`
Invite statuses: `pending` → `submitted` → `approved`

## Delete tournament
Confirmation → `Watch Ad & Delete` (rewarded ad gate) → deletes and returns to `MyTournament`

---

# 14. MY TOURNAMENT SCREEN (`MyTournament`)

Header: `My Tournaments` · right `+ New`
Card: name · status badge `🔴 LIVE` / `✅ Done` / `📅 Upcoming` · 🏢 organisation · 📍 venue · `<n> Teams • <n> Matches` · format
**Note:** this list shows tournaments you *joined*, excluding ones you created.
Empty state: 🏆 `No Tournaments` / `Create your first tournament` / `+ Create Tournament`

---

# 15. TOURNAMENT LEADERBOARD (`TournamentLeaderboard`)

Header: `<name> — Points Table`

**Columns in order:** `#` · `Team` · `P` · `W` · `L` · `T` · `NRR` · `Pts`

- Rank 1–3 show 🥇 🥈 🥉; rank 1 row highlighted yellow
- NRR shown with `+` prefix when positive; green if ≥ 0, red if negative
- Sort: Points descending, then NRR descending

**Legend:**
```
P = Played  W = Won  L = Lost  T = Tied
NRR = Net Run Rate  Pts = Points
Sorted by Points, then NRR
```
Empty state: 🏅 `No Teams Yet` / `Add teams and complete matches to see the points table`

**Points rule:** Win = 2 · Tie/No result = 1 · Loss = 0
**NRR formula:** (runs scored ÷ overs faced) − (runs conceded ÷ overs bowled). If a side is all out, the full quota of overs is used as the denominator.

---

# 16. JOIN AS CAPTAIN (`JoinAsCaptain`)

Header: `Join as Team Captain`

| Field | Details |
|---|---|
| Label | `Enter the invite code shared by your tournament organizer` |
| Placeholder | `e.g. A7X92K` |
| Behaviour | Forced uppercase, max 10 characters |

**Button:** `Continue`

| Condition | Title | Message |
|---|---|---|
| Blank code | `Error` | `Enter the invite code your organizer shared with you` |
| Unknown code | `Invalid Code` | `No tournament found for this invite code. Please check with your organizer.` |
| Already used | `Already Submitted` | `The squad for "<Team>" has already been submitted.` |
| Lookup failed | `Error` | `Could not verify invite code` |

Success → `TournamentInvitePreview`

---

# 17. TOURNAMENT INVITE PREVIEW (`TournamentInvitePreview`)

Header: `Tournament Invite` (read-only)

- Tournament card: name · `📍 <venue>` · `<start> — <end>` · `Format: <format>`
- `You're joining as captain of:` + your team name
- `Teams already in this tournament (<n>)` — per team: name, `<n> players`, comma-separated player names
- Empty: `No other teams added yet.`

**Button:** `Continue — Add My Team's Players` → `CreateTeam` in captain-invite mode

---

# 18. MY MATCHES SCREEN (`MyMatches`)

Header: `My Matches` · right `History`

- Profile banner: avatar · `Welcome <Name>` · `<n> matches played`
- `RECENT FORM` pills — last 5 results as `W` (green) / `L` (red) / `T` (orange)

**Tabs:** `Batting` · `Bowling` · `Fielding`

| Tab | Stats shown |
|---|---|
| Batting | Runs (headline) · Balls · 4s · 6s · SR · Avg · HS · 50s · 100s |
| Bowling | Wickets (headline) · Overs · Runs · Eco · Best · Wides · NoBalls |
| Fielding | 🧤 Catches · 🏃 Run Outs · 🥅 Stumpings · 📋 Matches |

**Not-linked state:** `No Player Profile Linked` / `Create or edit a team and mark your own player entry to start tracking...` + `Go to Teams`
Empty per tab: `No batting stats yet` / `No bowling stats yet` / `No fielding stats yet`

---

# 19. MATCH HISTORY DETAIL (`MatchHistoryDetail`)

Header: `Match History` · right `Teams`

### Filters
- Count chips: `Total <n>` · `Done <n>`
- Three dropdowns: match type, date range, ball type

| Filter | Options |
|---|---|
| Match type | `All` · `Tournament` · `Normal` |
| Ball type | `All` · `Leather Ball` · `Tennis Ball` · `Turf` |
| Date range (free) | `Today` · `Last 7 Days` |
| Date range (ad-gated) | `Last 60 Days` · `Custom` · `Lifetime` |

Selecting an ad-gated range opens a rewarded-ad confirmation first.

### Tabs
`📋 Matches` · `🏏 Batting` · `🎯 Bowling` · `🧤 Fielding`

- **Matches tab:** `Best Partnerships` (top 5 — rank, pair names, opponent, `runs(balls)`, unbeaten flag) then the match list
- **Batting tab:** sort chips `Runs` · `Average` · `Strike Rate`; cards show SR, Avg, HS, 4s/6s
- **Bowling tab:** sort chips `Wickets` · `Economy` · `Average`; cards show Overs, Runs, Eco, SR, Avg, Wides, NoBalls, Best
- **Fielding tab:** summary grid + per-player breakdown

---

# 20. HISTORY SCREEN (`History`)

Header: `Match History`
Search placeholder: `Search by team name or venue...` with `✕` clear
Match card: `#<matchId>` · status badge `Done` / `Live` / `Paused` · `<Team1> vs <Team2>` · `📍 <venue>` · `📅 <date>` · both innings scores · `🏆 <winner>`
Tapping a card → `Scorecard`
Empty: 🏏 `No Matches Found` / `Start scoring to see history here` + `+ Start Match` (searching shows `No matches found for "<query>"` with no button)
List caps at the 50 most recent matches.

---

# 21. PROFILE SCREEN (`Profile`)

- `Profile`
- `👤 <name>` (fallback `Unnamed Player`)
- `🏏 Matches: <n>`
- Button `Logout` (no confirmation on this screen)

---

# 22. PROFILE EDIT SCREEN (`ProfileEdit`)

Header: `Edit Profile` · right `Save`

- Photo circle: 📷 `Add Photo` → `Change Photo`; alert `Profile Photo` / `Choose source` → `Camera` · `Gallery` · `Cancel`

| Label | Type | Options / Placeholder |
|---|---|---|
| `Full Name *` | TextInput | `Enter your name` — required |
| `Mobile Number` | Read-only 🔒 | Shows `+91 <number>` or `Not set` |
| `Email ID` | TextInput | `Enter email address` |
| `Playing Role` | Chips | **`Batter` · `Bowler` · `Wicket Keeper` · `All Rounder`** (default `Batter`) |
| `Batting Style` | Chips | **`Right Hand` · `Left Hand`** (default `Right Hand`) |
| `Bowling Style` | TextInput | `e.g. Right Arm Fast, Left Arm Spin...` |
| `Country` | Dropdown modal `Select Country` | 20 options (default `India`) |

**Country list:** `India` · `Australia` · `England` · `Pakistan` · `South Africa` · `New Zealand` · `West Indies` · `Sri Lanka` · `Bangladesh` · `Zimbabwe` · `Afghanistan` · `Ireland` · `Netherlands` · `Scotland` · `UAE` · `Nepal` · `USA` · `Canada` · `Kenya` · `Singapore`

**Button:** `Save Profile` / `Saving...`
Validation: blank name → `Please enter your name`. Success → `Saved!` / `Profile updated successfully`

---

# 23. SETTINGS SCREEN (`Settings`)

Header: `Settings`

| Icon | Label | Sub-label | Action |
|---|---|---|---|
| 👤 | `Edit Profile` | `Name, photo, playing role` | → `ProfileEdit` |
| 👥 | `My Teams` | `Manage your teams` | → `MyTeams` |
| 📊 | `My Matches` | `Match history & stats` | → `MyMatches` |
| 🔔 | `Notifications` | `Coming soon` | Alert `Coming Soon` / `Notifications will be available soon!` |
| 🚪 | `Logout` | `Sign out of your account` | Confirm `Logout` / `Are you sure you want to logout?` |
| 🗑️ | `Delete Account` | `Permanently delete all data` | Confirm `Delete Account` / `This will permanently delete your account and all data. Are you sure?` |

Footer: `Cricket Scorer v1.0.0`

---

# 24. LIVE STREAM HUB (`LiveStream`)

Header: `Live Streaming`
Hero: `LIVE` badge · `Live Cricket Scoring` · `Start, share and follow live matches in real time`

### Option cards (5)

| Icon | Title | Subtitle | Destination |
|---|---|---|---|
| `+` | `Go Live — Start Match` | `Create a new match and score ball by ball. Others can follow live using your Match ID.` | `NewMatch` |
| `ID` | `Join by Match ID` | `Enter a Match ID shared by scorer to follow live score updates.` | `LiveView` |
| `SH` | `Share Live Score` | `While scoring, tap Share to send live scores via WhatsApp or other apps.` | Info alert |
| 📊 | `My Live Streams` | `View active, scheduled, completed, and draft live streams.` | `MyLiveStreams` |
| 💎 | `Streaming Plans` | `Unlock more live matches and premium score themes.` | `StreamingPlans` |

### `How to Go Live` steps
1. `Tap Go Live — Start Match above`
2. `Select teams, overs, toss`
3. `Choose opening batsmen and bowler`
4. `Start scoring — your match goes live instantly`
5. `Share the Match ID with others to follow live`

---

# 25. STREAMING DASHBOARD (`StreamingDashboard`)

Header: `Streaming Dashboard` · loading `Loading match…`

### Card: `Match Information`
`Tournament match` (if applicable) · `<Team1> vs <Team2>` · `Venue: <venue>` · `Overs: <n>` · `Status: <status>`

### Card: Streaming status
- Badge: **`LIVE`** (red) · **`PAUSED`** (orange) · **`OFFLINE`** (grey)
- Duration timer `H:MM:SS` or `M:SS` while live
- Metric `Viewers` → `—` (placeholder)
- Metric `Connection` → **`Excellent` · `Good` · `Poor` · `Disconnected`** (red when Poor/Disconnected)
- Note: `Viewer count and stream health require YouTube Data API integration — shown as placeholders until that's connected.`

### Card: `Viewer Statistics`
Placeholder note: `Detailed viewer stats (peak viewers, average watch time, likes, comments, country/device breakdown) require YouTube Data API integration — a separate setup step (YouTube channel + API credentials). Placeholder shown until that's connected.`

### Card: `Sponsor Banner`
`Coming soon — local sponsors will be able to display a banner on this tournament's live stream and scorecard.`

### Card: `Stream Source`
- Not connected: TextInput placeholder `YouTube URL or RTMP stream key` + button `Connect Stream` / `Connecting…`
- Connected: `✓ Connected` + the URL (input is replaced permanently)

### Card: `Streaming Quality`

| Option | Data usage label |
|---|---|
| `360p` | `~150 MB/hr` |
| `480p` | `~300 MB/hr` |
| `720p` | `~800 MB/hr` |
| `1080p` | `~1.6 GB/hr` |
| `Auto` | `Adjusts automatically` |

### Card: `Streaming Controls` (organiser only)

| Button | Condition |
|---|---|
| `🎨 Change Overlay Theme` | Stream connected |
| `✏️ Edit Stream Details` | Always |
| `▶ Start Live` | Not streaming |
| `⏸ Pause Live` | Streaming, not paused |
| `▶ Resume` | Paused |
| `⏹ End Live` | Streaming |
| `Share Live Link` | Always |
| `Copy Match Link` | Always |
| `🎬 Recording (Coming Soon)` | Always |
| `Go to Scoring Screen →` | Always |

Non-organiser note: `Only the match organizer can control streaming. You have read-only access.`

### Modal: `Edit Stream`
Fields: `Stream title` · `Description` (multi-line) · toggle `Enable Comments` (default on)
Buttons: `Save` · `Cancel`

### Alerts

| Trigger | Title | Message |
|---|---|---|
| Weak network | `Weak Connection` | `Your internet connection is unstable — streaming quality may drop.` |
| Bad URL | `Invalid Stream Source` | (validator message) |
| Connected | `Connected` | `Stream source connected successfully. Tap Start Live when ready.` |
| Start without URL | `No Stream Connected` | `Connect a YouTube URL or stream key first.` |
| End stream | `End Live Stream` | `Stop streaming? The match scoring will continue, but the live video feed will end.` → `Cancel` · `End Live` |
| Recording | `Coming Soon` | `Automatic recording of highlights, full match, and short clips will be available in a future update.` |

### Share sheet (`Share Live Match`)
Options: `WhatsApp` 💬 · `Telegram` ✈️ · `More Apps` 📤 · `Copy Link` 🔗 · `QR Code` 📱 · `Cancel`
Message template:
```
🏏 <Team1> vs <Team2>
Match ID: <matchId>
Watch live: Open CricketScorer app → Live Match → Enter ID: <matchId>
```
`QR Code` → `QR code sharing coming soon — for now, share the Match ID directly.`

### Stream URL validation

| Accepted | Example |
|---|---|
| YouTube watch | `https://youtube.com/watch?v=abc123` |
| YouTube live | `https://youtube.com/live/abc123` |
| Short link | `https://youtu.be/abc123` |
| RTMP | `rtmp://a.rtmp.youtube.com/live2/xxxx-xxxx` |
| Any http(s) URL | treated as embeddable |

Errors: `Please enter a stream URL or key` · `Enter a valid YouTube URL or RTMP stream key`
Not accepted: bare RTMP keys without `rtmp://`, `rtmps://`, `youtube.com/shorts/`, `youtube.com/embed/`

---

# 26. MY LIVE STREAMS (`MyLiveStreams`)

Header: `My Live Streams`

**Tabs (with counts):** `Active (<n>)` · `Scheduled (<n>)` · `Completed (<n>)` · `Draft (<n>)`

| Tab | Contains | Badge |
|---|---|---|
| `Active` | Live and actively streaming | `LIVE` |
| `Scheduled` | Live but not yet streaming | `Ready` |
| `Completed` | Finished with stream history | `Done` |
| `Draft` | Always empty (planned feature) | — |

Card: `<Team1> vs <Team2>` · venue · `Match ID: <id>`
Tap → `Scorecard` if completed, else `StreamingDashboard`
Empty: `No active streams` / `Streams you start will appear here.`
Draft tab: `Scheduled/Draft Streams` / `Coming soon — this will let you schedule a live stream ahead of time instead of starting it immediately.`

---

# 27. STREAMING PLANS (`StreamingPlans`)

Header: `Streaming Plans`
Banner: `💎 Coming Soon` / `Payment for streaming plans isn't live yet — pricing shown below is a preview.`

| Plan | Price | Features |
|---|---|---|
| `Per Match` | `₹99` | `1 live match` · `Basic score themes` |
| `Daily` | `₹499` | `Unlimited streaming for 24 hours` · `Basic score themes` |
| `Monthly` | `₹1,499` | `Unlimited match streaming` · `Basic score themes` |
| `Monthly Premium` ⭐ `Most Popular` | `₹2,499` | `Unlimited match streaming` · `All premium score themes` |
| `Yearly` | `₹9,999` | `Unlimited match streaming` · `Basic score themes` |
| `Yearly Premium` | `₹14,999` | `Unlimited match streaming` · `All premium score themes` |

Display-only — no purchase buttons (payment integration deferred).

---

# 28. THEME SELECTOR (`ThemeSelector`)

Header: `Score Overlay Theme` — each card shows a **live preview** of the overlay.

| Theme | Tier | Primary | Background | Accent |
|---|---|---|---|---|
| `Classic` | `Free` | `#1a6fa8` | `#0d2137` | `#4ade80` |
| `Modern` | `Free` | `#16a34a` | `#0a1628` | `#facc15` |
| `Dark` | `Free` | `#374151` | `#111827` | `#f87171` |
| `Minimal` | `Free` | `#ffffff` | `#f3f4f6` | `#3b82f6` |
| `IPL Style` | `🔒 Premium` | `#c9a000` | `#1a1a2e` | `#e94560` |
| `International` | `🔒 Premium` | `#003f87` | `#ffffff` | `#c8102e` |
| `Neon Theme` | `🔒 Premium` | `#00ffcc` | `#0a0a0a` | `#ff00ff` |
| `Gradient Theme` | `🔒 Premium` | `#8b5cf6` | `#3b82f6` | `#f59e0b` |
| `Glass Theme` | `🔒 Premium` | translucent white | translucent black | `#60a5fa` |

Premium gate: `Premium Theme` / `This theme is part of the Premium pack. Unlock it from Streaming Plans.` → `Cancel` · `View Plans`

---

# 29. LIVE VIEW — spectator mode (`LiveView`)

### Stage A — Join
Header `Join Live Match` · `LIVE` badge · `Watch Live Match` / `Enter the Match ID shared by the scorer`
Field placeholder: `Match ID  (e.g. AB1234)` — forced uppercase, max 8 characters
Button `Join Match` · hint `Ask the scorer to tap Share ID on scoring screen`
Validation: under 4 characters → `Please enter a valid Match ID` · unknown ID → `Match not found`
If the match is already finished, jumps straight to `Scorecard`.

### Stage B — Connecting
`Connecting to match...`

### Stage C — Live view
Header: `Back` · `LIVE` pill with `<Team1> vs <Team2>` · `#<matchId>`

- **Video panel** (when the scorer has a stream): embedded YouTube player with the score overlay on top; toggle `Hide Video` / `Show Video`; placeholder `Video Paused`
- **No-stream state:** `SCORE ONLY` badge · `No live video stream available` · `Score is updating live from Firebase`
- **Score card:** `<Team> batting` · `Innings <n>` · big score · `<overs>/<total> ov` · `RR: <rate>` · `Need <n>` · `RRR: <rate>` · `Last:` + last 8 balls
- **Batting table:** `Batter` · `R` · `B` · `4s` · `6s` · `SR` (striker marked `*` with sub-label `batting`, other `non-striker`)
- **Bowling table:** `Bowler` · `O` · `R` · `W` · `Eco` (sub-label `bowling`)
- **Extras:** `Extras: <total>` and `W:<n>  NB:<n>  B:<n>  LB:<n>`
- **Milestone banner:** `🎉 <Player>: <text>` (shows for 15 seconds)
- **AI Commentary card:** `🤖 AI Commentary` — empty state `Commentary will appear here once scoring begins.`

**View tabs:** `Live` · `Analytics`

| Tab | Content |
|---|---|
| `Live` | `Current Partnership` → `<runs> runs (<balls> balls)`; `Ball-by-Ball` → last 12 balls |
| `Analytics` | `Worm Graph`; `Win Probability` — split bar per team with percentages, note `Estimate based on required run rate and wickets in hand — not a statistical prediction.` |

**Links:** `📊 View Full Scorecard` · `🏆 View Tournament Points Table` (tournament matches only)

---

# 30. CAMERA MODE (`CameraMode`)

Header: `Camera Mode` — all options tagged `Coming Soon`, display only:
`Single Camera` · `Multiple Camera` · `Front Camera` · `Rear Camera` · `External Camera` · `Screen Recording`

---

# 31. PUBLIC MATCH (`PublicMatch`)

Minimal stub: `<Team1> vs <Team2>` · 1st-innings score · `Status: <status>`. No inputs. Currently not linked from anywhere in the app.

---

# MASTER REFERENCE — every option list in one place

### Match configuration
| Setting | Options |
|---|---|
| Overs (quick match) | `5` · `10` · `15` · `20` · `50` · custom (max 3 digits) |
| Overs (tournament) | `6 Overs` · `8 Overs` · `20 Overs` · `50 Overs` · `Others` (custom) |
| Ball type (match) | `Leather Ball` · `Tennis Ball` · `Turf` |
| Ball type (tournament) | `Leather Ball` · `Tennis Ball` |
| Players per side | `4`–`11` (Turf only; otherwise fixed at 11) |
| Toss choice | `Bat` · `Bowl` |

### Ball outcomes
| Category | Options |
|---|---|
| Runs | `0` · `1` · `2` · `3` · `4` · `6` |
| Wide extra runs | `0`–`5` (plus the automatic 1) |
| No-ball extra runs | `0`–`6` (plus the automatic 1) |
| Byes / Leg byes | Mode toggle, then any run button |
| Penalty | `1`–`5` or custom (default `5`) |
| Wicket types | `Bowled` · `Caught` · `LBW` · `Run Out` · `Stumped` · `Hit Wicket` · `Retired` |
| Run-out runs completed | `0`–`3` |

### Match end reasons
`Pause Match` · `Match Abandoned` · `Network Issue` · `Bad Weather` · `Pitch Issue` · `Other Reason`

### Player attributes
| Attribute | Options |
|---|---|
| Role | `Batter` · `Bowler` · `Wicket Keeper` · `All Rounder` |
| Batting style | `Right Hand` · `Left Hand` |
| Bowling style | Free text (e.g. `Right Arm Fast`) |
| Player type | `registered` (phone registered) · `guest` (auto-derived) |
| Flags | Captain (`C`) · Wicket-keeper (`WK`) — one each per team |
| Team type | `My Team` · `Other Team` |

### Tournament configuration
| Setting | Options |
|---|---|
| Format | `League` · `Knockout` · `Pool + Knockout` |
| Pool qualifiers | `Top 1` · `Top 2` · `Top 4` |
| Knockout stages | `Round of 16` · `Quarter Final` · `Semi Final` · `Third Place Match` · `Final` |
| Team lock mode | `Manual` · `On Tournament Start` · `After League/Pool Stage` · `Before Knockout` |
| Tournament status | `upcoming` · `live` · `completed` |
| Match status | `scheduled` · `live` · `completed` |
| Captain invite status | `pending` · `submitted` · `approved` |
| Team registration status | `pending` · `playersAdded` · `complete` · `locked` |

### Statistics tracked
| Discipline | Metrics |
|---|---|
| Batting | Runs · Balls · 4s · 6s · Dots · Strike Rate · Average · High Score · 50s · 100s · Ducks · Not Outs |
| Bowling | Overs · Balls · Runs · Wickets · Wides · No-balls · Maidens · Dots · Economy · Average · Strike Rate · Best Figure |
| Fielding | Catches · Stumpings · Run Outs |
| Team | Played · Won · Lost · Tied · Points · NRR |

### Filters (Match History Detail)
| Filter | Options |
|---|---|
| Match type | `All` · `Tournament` · `Normal` |
| Ball type | `All` · `Leather Ball` · `Tennis Ball` · `Turf` |
| Date (free) | `Today` · `Last 7 Days` |
| Date (ad-gated) | `Last 60 Days` · `Custom` · `Lifetime` |
| Batting sort | `Runs` · `Average` · `Strike Rate` |
| Bowling sort | `Wickets` · `Economy` · `Average` |

### Streaming
| Setting | Options |
|---|---|
| Source | YouTube watch/live/short URL · RTMP URL |
| Quality | `360p` · `480p` · `720p` · `1080p` · `Auto` |
| Stream state | `LIVE` · `PAUSED` · `OFFLINE` |
| Connection | `Excellent` · `Good` · `Poor` · `Disconnected` |
| Free themes | `Classic` · `Modern` · `Dark` · `Minimal` |
| Premium themes | `IPL Style` · `International` · `Neon Theme` · `Gradient Theme` · `Glass Theme` |
| Plans | `Per Match ₹99` · `Daily ₹499` · `Monthly ₹1,499` · `Monthly Premium ₹2,499` · `Yearly ₹9,999` · `Yearly Premium ₹14,999` |
| Share targets | `WhatsApp` · `Telegram` · `More Apps` · `Copy Link` · `QR Code` |

### Profile
| Field | Options |
|---|---|
| Playing role | `Batter` · `Bowler` · `Wicket Keeper` · `All Rounder` |
| Batting style | `Right Hand` · `Left Hand` |
| Country | 20 options, default `India` |
| PIN | 4–6 digits |

---

# Rules engine (automatic behaviour)

| Rule | Behaviour |
|---|---|
| Legal delivery | Wides and no-balls do not count toward the over; byes and leg-byes do |
| Bowler charge | Wides and no-balls are charged to the bowler; byes and leg-byes are not |
| Batter ball faced | No-balls count as a ball faced; wides do not |
| Strike rotation | Automatic on odd runs and at the end of each over |
| Over completion | 6 legal deliveries |
| All out | Wickets = players per side − 1 |
| Innings end | All out, or overs complete |
| Chase end | The moment the target is passed |
| Free hit | Set after a no-ball, cleared on the next legal delivery |
| Undo | Replays the whole innings from ball history minus the last event; a single undo after a wicket also reverses the incoming batter |
| Tournament sync | Match completion updates points, NRR, pool standings and advances knockout winners |
| Points | Win 2 · Tie/No result 1 · Loss 0 |
| NRR | (runs ÷ overs faced) − (runs conceded ÷ overs bowled); all-out sides use the full over quota |
| Player identity | Phone number is the key; guest records auto-upgrade to registered when that number signs up |

---

# Features marked "Coming Soon"

| Feature | Where |
|---|---|
| Notifications | Settings |
| Camera modes (all 6) | Camera Mode screen |
| Recording / highlights | Streaming Dashboard |
| Viewer statistics | Streaming Dashboard (needs YouTube Data API) |
| Sponsor banner | Streaming Dashboard |
| Payment for plans | Streaming Plans |
| Draft / scheduled streams | My Live Streams |
| QR code sharing | Share sheet |

---

# Ad-gated (rewarded video) actions

| Action | Screen |
|---|---|
| 2nd and 3rd OTP of the day | Forgot Password |
| Generate AI match summary | Scorecard |
| Date ranges beyond 7 days | Match History Detail |
| Delete tournament | Tournament Detail |
| Viewing tournament stats (interstitial) | Tournament Detail |
| Match complete / share (interstitial) | Scorecard |

