# Kickoff

A Quickshell bar plugin for live football: today's matches grouped by competition, followed clubs, league tables, match events, and goal notifications.

The pill on the bar shows a live score when a followed club is playing (`ARS 1-0 CHE  67'`), `LIVE N` when several matches are on, or the next followed kickoff. Click it for the panel.

## Features

- **Matches** — two-line score cards, grouped by competition, with yesterday / today / tomorrow.
- **Following** — pin clubs from search; their matches lift into a **YOUR CLUBS** group at the top of the Matches list, live games first, and come out of their league group so nothing shows twice. Each pinned row carries its competition crest in place of a league header.
- **Table** — Premier League, LaLiga, Bundesliga, Serie A, Ligue 1, Champions League, Europa League, MLS.
- **Match detail** — score, goal/card events, possession, xG, shots.
- **Goal toasts** — desktop notifications when a followed club scores.
- Live polling every 20 seconds while matches are in progress, every 3 minutes otherwise.

## Goals

When a goal goes in, the bar stops what it is doing: the scoreline steps aside, a net swings in at the end of the pill, and the ball rolls across in an arc, spinning, until it is buried. The net bulges, a ring pings out from the impact, and a shout lands in place of the score — `GET IN!`, `TOP CORNER!`, `GOOOAAAL!` — before everything settles back to the new scoreline. Goals arriving together queue up rather than trampling each other.

The same goal lights the match up in the panel: the card pulses accent three times, the scoreline pops, and the row keeps a highlight for thirty seconds so a goal you missed is still obvious when you open the panel.

Follow clubs and only their goals get the treatment. Follow nobody and every goal does — the same rule the bar pill uses to pick what it shows.

To see it without waiting for a goal:

```bash
omarchy-shell atsokolas.kickoff celebrate
```

That runs the real path against the first match on screen, so it exercises exactly what a live goal does.

## Details

Each match sits on its own bordered card, so games never run together. A pulsing ⚽ marks anything live, and 🥅 sits beside whoever is ahead — mid-game or at full time. Cards lift a little under the cursor, the panel content settles in when it opens, and the refresh icon spins while it is working.

While a match is live the ball on the bar never sits quite still, and the one in the panel header rocks along with it. On a day with no fixtures at all, it rolls itself back and forth across the empty panel instead. The panel header keeps its own running commentary on the day.

## Requirements

- Omarchy Quattro (Quickshell plugin support)
- `curl`
- Network access for the score feed

No account or API key.

## Install

```bash
omarchy plugin add https://github.com/atsokolas/omarchy-kickoff-plugin.git --enable
```

That clones the plugin into `~/.config/omarchy/plugins/atsokolas.kickoff`, validates it against the shell's manifest schema, and puts it on the bar. Move it if it did not land where you want:

```bash
omarchy bar move atsokolas.kickoff --section right --before omarchy.network
```

Pull later changes with:

```bash
omarchy plugin update atsokolas.kickoff
```

## Use

- Left-click the bar pill to open or close the panel.
- Right-click or middle-click to refresh.
- **Matches / Following / Table** switch the main views.
- Click a match for events and stats. **Follow home / away** pins that club.
- Gear opens settings: goal notifications, all-competitions vs featured, and club search.

Keys while the panel is open:

| Key | Action |
| --- | --- |
| `1` `2` `3` | Matches / Following / Table |
| `h` `l` | Previous / next day |
| `j` `k` | Move through matches |
| Enter | Open match |
| `s` | Settings |
| `n` | Toggle goal notifications |
| `t` | Jump to today |
| `r` | Refresh |
| Esc | Back / close |

## Data

Scores, tables, and match detail are read from a public website JSON feed (`https://www.fotmob.com/api/data/...`) with crests from `images.fotmob.com`. That feed is unofficial and can change. Nothing is scraped from a logged-in session, and nothing is written back.

Followed clubs and notification preferences are stored on the widget's entry in `~/.config/omarchy/shell.json`.

## Tests

```bash
node --test tests/model.test.js
```

## Remove

```bash
omarchy plugin disable atsokolas.kickoff
omarchy plugin remove atsokolas.kickoff --yes
```
