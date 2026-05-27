import { weeks } from "./data/weeks.js";

const { useEffect, useMemo, useState } = window.React;
const h = window.React.createElement;
const OUTCOMES = ["1", "X", "2"];
const bettingWeeks = weeks.filter((week) => week.id >= 3);

function money(value) {
  return `₦${Math.round(value).toLocaleString("en-NG")}`;
}

function dateLabel(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T12:00:00`));
}

function orderSelections(values) {
  return [...values].sort((a, b) => OUTCOMES.indexOf(a) - OUTCOMES.indexOf(b));
}

function numericHash(value) {
  return [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
}

function preferenceRates(match, index) {
  const seed = numericHash(`${match.id}-${match.home}-${match.away}-${index}`);
  const favorite = OUTCOMES[seed % OUTCOMES.length];
  const second = OUTCOMES[(seed + 1) % OUTCOMES.length];
  const rates = {
    "1": 18 + ((seed * 3) % 12),
    X: 17 + ((seed * 5) % 11),
    "2": 18 + ((seed * 7) % 12),
  };

  rates[favorite] = 44 + (seed % 18);
  rates[second] += 6 + (seed % 7);

  const total = OUTCOMES.reduce((sum, outcome) => sum + rates[outcome], 0);
  const scaled = Object.fromEntries(OUTCOMES.map((outcome) => [
    outcome,
    Math.round((rates[outcome] / total) * 100),
  ]));
  const difference = 100 - OUTCOMES.reduce((sum, outcome) => sum + scaled[outcome], 0);
  scaled[favorite] += difference;

  return scaled;
}

function rankedOutcomes(match, index) {
  const rates = preferenceRates(match, index);
  return OUTCOMES
    .map((outcome) => ({ outcome, rate: rates[outcome] }))
    .sort((a, b) => b.rate - a.rate);
}

function emptySelections(week) {
  return Object.fromEntries(week.matches.map((match) => [match.id, []]));
}

function calculateResult(week, selections) {
  const rows = week.matches.map((match) => {
    const selected = selections[match.id] || [];
    const hit = selected.includes(match.result);
    return { match, selected, hit };
  });
  const correct = rows.filter((row) => row.hit).length;
  const tier = week.payoutSummary.find((row) => row.correct === correct);

  return {
    rows,
    correct,
    tier,
    won: tier ? tier.prizePerWinner : 0,
  };
}

function createMaskedIds(weekId, correct, count) {
  return Array.from({ length: count }, (_, index) => {
    const lastThree = String((weekId * 173 + correct * 41 + index * 17) % 1000).padStart(3, "0");
    return `B9J-XXXXX${lastThree}`;
  });
}

function pastResultWeeks() {
  return weeks.slice(0, 2).map((week) => ({
    ...week,
    payoutSummary: week.payoutSummary.map((row) => ({
      ...row,
      userIds: createMaskedIds(week.id, row.correct, row.winners),
    })),
  }));
}

function App() {
  const [weekId, setWeekId] = useState(bettingWeeks[0].id);
  const activeWeek = bettingWeeks.find((week) => week.id === weekId) || bettingWeeks[0];
  const [selections, setSelections] = useState(() => emptySelections(activeWeek));
  const [settled, setSettled] = useState(false);
  const [view, setView] = useState("bet");

  useEffect(() => {
    setSelections(emptySelections(activeWeek));
    setSettled(false);
    setView("bet");
  }, [activeWeek.id]);

  const selectedLines = activeWeek.matches.filter((match) => (
    (selections[match.id] || []).length > 0
  )).length;
  const allSelected = selectedLines === activeWeek.matches.length;
  const totalSelections = activeWeek.matches.reduce((total, match) => {
    return total + (selections[match.id] || []).length;
  }, 0);
  const extraSelections = allSelected ? Math.max(0, totalSelections - activeWeek.matches.length) : 0;
  const combinations = 2 ** extraSelections;
  const stake = activeWeek.minimumStake * combinations;
  const result = useMemo(() => calculateResult(activeWeek, selections), [activeWeek, selections]);
  const slipProps = {
    allSelected,
    combinations,
    extraSelections,
    selectedLines,
    stake,
    activeWeek,
    settled,
    result,
    onPlace: () => {
      setSettled(true);
      setView("ticketResult");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onClear: clearSelections,
    onPattern: fillPattern,
    onEdit: () => setSettled(false),
  };

  function toggleSelection(matchId, outcome) {
    if (settled) return;
    setSelections((current) => {
      const existing = current[matchId] || [];
      const next = existing.includes(outcome)
        ? existing.filter((item) => item !== outcome)
        : orderSelections([...existing, outcome]);
      return { ...current, [matchId]: next };
    });
  }

  function fillPattern() {
    applyQuickPick("ideal");
  }

  function applyQuickPick(mode) {
    setSettled(false);
    setSelections(Object.fromEntries(activeWeek.matches.map((match, index) => {
      const ranked = rankedOutcomes(match, index).map((item) => item.outcome);
      if (mode === "popular") {
        return [match.id, [ranked[0]]];
      }
      if (mode === "ideal") {
        return [match.id, orderSelections(index % 5 === 1 ? ranked.slice(0, 2) : [ranked[0]])];
      }
      if (mode === "surprise") {
        const lowest = ranked[2];
        const second = ranked[1];
        return [match.id, orderSelections(index % 5 === 2 ? [second, lowest] : [index % 3 === 0 ? lowest : second])];
      }
      const shuffled = [...OUTCOMES].sort(() => Math.random() - 0.5);
      return [match.id, orderSelections(index % 6 === 0 ? shuffled.slice(0, 2) : [shuffled[0]])];
    })));
  }

  function clearSelections() {
    setSettled(false);
    setSelections(emptySelections(activeWeek));
  }

  function betAgain() {
    setSettled(false);
    setView("bet");
    setSelections(emptySelections(activeWeek));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showBetPage(nextWeekId) {
    setWeekId(nextWeekId);
    setView("bet");
  }

  return h("div", { className: "app-shell" },
    h(Header),
    h("main", { className: "bet9ja-layout" },
      h(SideRail),
      h("section", { className: "content-panel" },
        h(TopStrip),
        h(ProductNav, {
          view,
          showLatestResults: () => setView("pastResults"),
          showRules: () => setView("rules"),
        }),
        h(WeekSelector, {
          activeWeek,
          view,
          setWeekId: showBetPage,
        }),
        view === "pastResults"
          ? h(PastResultsPage)
          : view === "rules"
            ? h(RulesPage)
          : view === "ticketResult"
            ? h(TicketResultPage, { activeWeek, result, stake, betAgain })
            : h(window.React.Fragment, null,
              h(PoolHeader, { activeWeek }),
              h(MatchBoard, {
                matches: activeWeek.matches,
                selections,
                settled,
                toggleSelection,
              }),
              h(QuickPickBar, { settled, onQuickPick: applyQuickPick }),
              h("div", { className: "slip-after-matches" }, h(BetSlip, slipProps)),
            ),
      ),
    ),
  );
}

function Header() {
  return h("header", { className: "header" },
    h("a", { className: "brand", href: "#top", "aria-label": "Bet9ja" },
      h("img", { src: "/assets/bet9ja-logo.svg", alt: "Bet9ja" }),
    ),
    h("nav", { className: "top-nav", "aria-label": "Primary" },
      ["Sports", "Live", "Casino", "League&Races", "Virtual", "Promotions"].map((item) => (
        h("a", {
          key: item,
          className: item === "Sports" ? "active" : "",
          href: "#top",
        }, item)
      )),
    ),
    h("div", { className: "auth-strip" },
      h("button", { type: "button" }, "Register"),
      h("button", { type: "button" }, "Login"),
    ),
  );
}

function SideRail() {
  const sports = [
    "Live Betting",
    "Super15 Pool",
    "Premier League",
    "La Liga",
    "UEFA Champions League",
    "International Friendly Games",
    "France Ligue 1",
    "Portugal Primeira Liga",
    "ATP - French Open",
    "NBA",
    "NFL",
    "MLB",
    "F1 - Monaco Grand Prix",
  ];

  return h("aside", { className: "side-rail" },
    h("label", { className: "search-box" },
      h("span", { className: "sr-only" }, "Search"),
      h("input", { placeholder: "Search for events, teams, leagues and players" }),
      h("span", { className: "search-icon" }),
    ),
    h("ul", { className: "sports-list" },
      sports.map((sport) => h("li", { key: sport, className: sport === "Super15 Pool" ? "selected" : "" },
        h("span", { className: "sport-dot" }),
        h("a", { href: "#top" }, sport),
      )),
    ),
    h("div", { className: "time-tabs" },
      ["TODAY", "3H", "24H", "72H", "ALL"].map((item) => (
        h("button", { type: "button", className: item === "ALL" ? "active" : "", key: item }, item)
      )),
    ),
    h("div", { className: "rail-footer" }, "SPORTS"),
  );
}

function TopStrip() {
  return h("div", { className: "top-strip" },
    h("span", null, "15:40 Africa/Lagos"),
    h("a", { href: "#top" }, "Help"),
    h("a", { href: "#top" }, "Stats"),
    h("a", { href: "#top" }, "Coupon Check"),
    h("a", { href: "#top" }, "Old Desktop"),
  );
}

function ProductNav({ view, showLatestResults, showRules }) {
  return h("div", { className: "product-nav", role: "tablist", "aria-label": "Super15 pages" },
    h("button", {
      type: "button",
      role: "tab",
      "aria-selected": view === "pastResults",
      className: view === "pastResults" ? "active" : "",
      onClick: showLatestResults,
    }, "Latest Results"),
    h("button", {
      type: "button",
      role: "tab",
      "aria-selected": view === "rules",
      className: view === "rules" ? "active" : "",
      onClick: showRules,
    }, "Rules"),
  );
}

function WeekSelector({ activeWeek, view, setWeekId }) {
  return h("div", { className: "week-scroller" },
    h("div", { className: "week-tabs", role: "tablist", "aria-label": "Weeks" },
      bettingWeeks.map((week) => h("button", {
        key: week.id,
        type: "button",
        role: "tab",
        "aria-selected": view === "bet" && week.id === activeWeek.id,
        className: view === "bet" && week.id === activeWeek.id ? "active" : "",
        onClick: () => setWeekId(week.id),
      }, `Week ${week.id}`)),
    ),
  );
}

function PoolHeader({ activeWeek }) {
  return h("div", { className: "pool-header" },
    h("div", null,
      h("p", { className: "section-kicker" }, "Soccer / Pools / 1X2"),
      h("img", { className: "super15-logo", src: "/assets/super15-logo.png", alt: "Super15" }),
      h("p", { className: "subline" }, "Premier League 10 + La Liga 5"),
    ),
    h("div", { className: "pool-stats" },
      h("span", null, "Prize Pool"),
      h("strong", null, money(activeWeek.pool)),
    ),
  );
}

function MatchBoard({ matches, selections, settled, toggleSelection }) {
  return h("div", { className: "board" },
    h("div", { className: "board-head" },
      h("span", null, "Today"),
      h("div", { className: "outcome-labels" },
        OUTCOMES.map((outcome) => h("span", { key: outcome }, outcome)),
      ),
    ),
    h("div", { className: "match-list" },
      matches.map((match, index) => h(MatchRow, {
        key: match.id,
        match,
        index,
        selected: selections[match.id] || [],
        settled,
        toggleSelection,
      })),
    ),
  );
}

function MatchRow({ match, index, selected, settled, toggleSelection }) {
  const rates = preferenceRates(match, index);

  return h("article", {
    className: [
      "match-row",
      settled && selected.includes(match.result) ? "is-hit" : "",
      settled && !selected.includes(match.result) ? "is-miss" : "",
    ].join(" "),
  },
    h("div", { className: "match-info" },
      h("div", { className: "league-name" }, match.league),
      h("div", { className: "teams" },
        h("strong", null, match.home),
        h("span", null, match.away),
      ),
      h("div", { className: "match-time" },
        h("span", null, `${dateLabel(match.date)} ${match.time}`),
        h("span", null, ` • ${142 + ((index * 11) % 45)} Markets`),
      ),
    ),
    h("div", { className: "pick-grid" },
      OUTCOMES.map((outcome) => {
        const isSelected = selected.includes(outcome);
        const isActual = settled && match.result === outcome;
        const className = [
          "pick-btn",
          isSelected ? "selected" : "",
          isActual ? "actual" : "",
          settled && isSelected && isActual ? "hit" : "",
          settled && isSelected && !isActual ? "miss" : "",
        ].join(" ");
        return h("div", { className: "pick-choice", key: outcome },
          h("span", { className: "pick-rate" }, `%${rates[outcome]}`),
          h("button", {
          key: outcome,
          type: "button",
          className,
          "aria-pressed": isSelected,
          title: outcome === "1" ? "Home" : outcome === "X" ? "Draw" : "Away",
          onClick: () => toggleSelection(match.id, outcome),
          }, outcome),
        );
      }),
    ),
  );
}

function QuickPickBar({ settled, onQuickPick }) {
  const modes = [
    ["popular", "Populer"],
    ["ideal", "Ideal"],
    ["surprise", "Supriz"],
    ["random", "Rastgele"],
  ];

  return h("section", { className: "quick-picks", "aria-label": "Quick selections" },
    h("div", { className: "quick-title" },
      h("span", null, "?"),
      h("strong", null, "Hizli Secim"),
    ),
    h("div", { className: "quick-buttons" },
      modes.map(([mode, label]) => h("button", {
        key: mode,
        type: "button",
        disabled: settled,
        onClick: () => onQuickPick(mode),
      }, label)),
    ),
  );
}

function BetSlip(props) {
  const {
    allSelected,
    combinations,
    extraSelections,
    selectedLines,
    stake,
    activeWeek,
    settled,
    result,
    onPlace,
    onClear,
    onPattern,
    onEdit,
  } = props;

  return h("aside", { className: "betslip" },
    h("div", { className: "slip-title" },
      h("span", null, "Bet Slip"),
      h("strong", null, `${selectedLines}/15`),
    ),
    h("div", { className: "slip-card" },
      h("div", { className: "slip-row" }, h("span", null, "Minimum"), h("strong", null, money(activeWeek.minimumStake))),
      h("div", { className: "slip-row" }, h("span", null, "Combinations"), h("strong", null, combinations.toLocaleString("en-NG"))),
      h("div", { className: "slip-row" }, h("span", null, "Extra Picks"), h("strong", null, allSelected ? extraSelections.toLocaleString("en-NG") : "0")),
      h("div", { className: "slip-row total" }, h("span", null, "Stake"), h("strong", null, allSelected ? money(stake) : "Select 15")),
      settled && h("div", { className: result.correct >= 12 ? "slip-result won" : "slip-result" },
        h("span", null, `${result.correct} correct`),
        h("strong", null, result.won ? money(result.won) : "No Prize"),
      ),
    ),
    h("div", { className: "slip-actions" },
      settled
        ? h("button", { type: "button", className: "primary", onClick: onEdit }, "Edit Bet")
        : h("button", { type: "button", className: "primary", disabled: !allSelected, onClick: onPlace }, "Place Bet"),
      h("button", { type: "button", onClick: onPattern, disabled: settled }, "Ideal Pick"),
      h("button", { type: "button", onClick: onClear }, "Clear"),
    ),
    h("div", { className: "slip-note" },
      h("span", null, "Pool"),
      h("strong", null, money(activeWeek.pool)),
    ),
  );
}

function TicketResultPage({ activeWeek, result, stake, betAgain }) {
  return h("section", { className: "result-page" },
    h(ResultPanel, { activeWeek, result, stake }),
    h("button", { type: "button", className: "bet-again", onClick: betAgain }, "Bet Again"),
  );
}

function ResultPanel({ activeWeek, result, stake }) {
  const title = result.correct >= 12
    ? `${result.correct} correct ticket`
    : `${result.correct} correct ticket`;

  return h("section", { className: "result-panel" },
    h("div", { className: "result-hero" },
      h("div", null,
        h("p", { className: "section-kicker" }, "Settled"),
        h("h2", null, title),
        h("p", null, `Stake ${money(stake)}. ${result.won ? `Prize ${money(result.won)}.` : "No prize tier."}`),
      ),
      h("div", { className: "score-badge" },
        h("span", null, "Correct"),
        h("strong", null, `${result.correct}/15`),
      ),
    ),
    h("div", { className: "weekly-table" },
      h("div", { className: "table-title" },
        h("span", null, "Weekly Results"),
        h("strong", null, money(activeWeek.pool)),
      ),
      activeWeek.payoutSummary.map((row) => h("div", { className: "weekly-row", key: row.correct },
        h("span", null, `${row.correct} correct`),
        h("span", null, `${row.winners.toLocaleString("en-NG")} winners`),
        h("span", null, money(row.sharedPrize)),
        h("strong", null, row.winners > 0 ? money(row.prizePerWinner) : "Rollover"),
      )),
    ),
    h("div", { className: "settled-list" },
      result.rows.map(({ match, selected, hit }) => h("div", {
        className: `settled-row ${hit ? "hit" : "miss"}`,
        key: match.id,
      },
        h("span", null, match.id),
        h("strong", null, `${match.home} ${match.score} ${match.away}`),
        h("span", null, `Pick ${selected.length ? selected.join("/") : "-"}`),
        h("b", null, hit ? "Won" : "Lost"),
      )),
    ),
  );
}

function PastResultsPage() {
  const resultWeeks = pastResultWeeks();
  const [resultWeekId, setResultWeekId] = useState(resultWeeks[1]?.id || resultWeeks[0].id);
  const activeResultWeek = resultWeeks.find((week) => week.id === resultWeekId) || resultWeeks[0];

  return h("section", { className: "past-results-page" },
    h("div", { className: "past-results-head" },
      h("p", { className: "section-kicker" }, "Latest Results"),
      h("h1", null, `Week ${activeResultWeek.id} Results`),
      h("p", null, "Winner IDs are masked. Only the last 3 digits are visible."),
    ),
    h("div", { className: "result-week-tabs" },
      resultWeeks.map((week) => h("button", {
        type: "button",
        key: week.id,
        className: week.id === activeResultWeek.id ? "active" : "",
        onClick: () => setResultWeekId(week.id),
      }, `Week ${week.id}`)),
    ),
    h("article", { className: "past-week" },
      h("div", { className: "table-title" },
        h("span", null, `Week ${activeResultWeek.id} Prize Summary`),
        h("strong", null, money(activeResultWeek.pool)),
      ),
      activeResultWeek.payoutSummary.map((row) => h("details", { className: "result-details", key: `${activeResultWeek.id}-${row.correct}` },
        h("summary", null,
          h("span", null, `${row.correct} correct`),
          h("span", null, `${row.winners.toLocaleString("en-NG")} winners`),
          h("span", null, money(row.sharedPrize)),
          h("strong", null, row.winners > 0 ? money(row.prizePerWinner) : "Rollover"),
        ),
        h("div", { className: "masked-ids" },
          row.userIds.map((id) => h("span", { key: id }, id)),
        ),
      )),
    ),
    h("article", { className: "past-week" },
      h("div", { className: "table-title" },
        h("span", null, `Week ${activeResultWeek.id} Match Results`),
        h("strong", null, "15 matches"),
      ),
      h("div", { className: "past-match-results" },
        activeResultWeek.matches.map((match) => h("div", { className: "past-match-row", key: match.id },
          h("span", null, match.league),
          h("strong", null, `${match.home} ${match.score} ${match.away}`),
          h("b", null, match.result),
        )),
      ),
    ),
  );
}

function RulesPage() {
  const ruleSections = [
    {
      title: "How Super15 Works",
      items: [
        "Super15 is a weekly football pool game based on 15 selected matches.",
        "Each coupon contains 10 Premier League matches and 5 La Liga matches for the selected week.",
        "For every match, choose the full-time result: 1 for home win, X for draw, or 2 for away win.",
        "The result is settled using the official full-time score after 90 minutes plus stoppage time. Extra time and penalties do not count.",
      ],
    },
    {
      title: "Selections And Multiple Picks",
      items: [
        "A valid ticket must contain at least one selection for all 15 matches.",
        "You may select more than one outcome on the same match. For example, 1/X covers both a home win and a draw.",
        "Selecting all three outcomes on one match covers 1, X, and 2 for that match.",
        "After the required 15 picks are made, every additional pick doubles the ticket coverage and the stake.",
      ],
    },
    {
      title: "Stake Calculation",
      items: [
        "The minimum stake is ₦100 for one straight 15-match ticket.",
        "Once all 15 matches have a pick, every extra pick doubles the stake.",
        "Example: 15 picks cost ₦100, 16 picks cost ₦200, 17 picks cost ₦400, and 18 picks cost ₦800.",
        "The stake shown in the bet slip updates automatically as extra picks are added or removed.",
      ],
    },
    {
      title: "Preference Percentages",
      items: [
        "Each 1, X, and 2 button shows a preference percentage above the selection button.",
        "The percentage represents the prototype crowd preference for that outcome on the selected match.",
        "These percentages are used by the quick-pick tools to decide which outcomes are popular, balanced, or surprising.",
        "Preference percentages are informational only. They do not change the official result, prize tier, or settlement logic.",
      ],
    },
    {
      title: "Quick Pick Modes",
      items: [
        "Populer selects the highest-preference outcome on every match and creates a simple 15-pick ticket.",
        "Ideal selects the highest-preference outcomes and adds limited double coverage on selected matches to improve ticket protection.",
        "Supriz leans toward lower-preference outcomes and selected upset coverage for players who want a higher-risk ticket.",
        "Rastgele creates a fresh random ticket and may add limited double coverage. The bet slip always shows the resulting stake before the ticket is placed.",
      ],
    },
    {
      title: "Winning Tiers",
      items: [
        "Only tickets with 12, 13, 14, or 15 correct predictions qualify for a prize.",
        "Tickets with 11 or fewer correct predictions do not receive a prize.",
        "The weekly prize pool is split across the winning tiers: 45% for 15 correct, 25% for 14 correct, 18% for 13 correct, and 12% for 12 correct.",
        "If more than one user wins in the same tier, that tier's prize amount is shared equally between all winners in that tier.",
        "If a winning tier has no winners in a future production version, that tier can be configured to roll over according to the operator's pool rules.",
      ],
    },
    {
      title: "Results And Settlement",
      items: [
        "In this prototype, results are revealed immediately after the ticket is placed.",
        "The results page shows the official score, your selected outcomes, whether each match was won or lost, your total correct picks, and any prize won.",
        "The Results tab lists previous weekly outcomes, the number of winners in each tier, the shared prize amount, and masked winner IDs.",
        "Winner IDs are displayed with only the last three digits visible for privacy.",
        "Bet Again returns the player to the same Super15 betting flow and clears the previous ticket.",
      ],
    },
    {
      title: "Prototype Notes",
      items: [
        "This is a product prototype and does not process real money.",
        "Prize pools, winner counts, and masked user IDs are sample data used to demonstrate the experience.",
        "The match fixtures and scores used in the weekly coupons are based on real 2025-2026 season results from the prototype dataset.",
      ],
    },
  ];

  return h("section", { className: "rules-page" },
    h("div", { className: "rules-hero" },
      h("img", { className: "rules-logo", src: "/assets/super15-logo.png", alt: "Super15" }),
      h("p", null, "Game Rules"),
    ),
    ruleSections.map((section) => h("article", { className: "rule-section", key: section.title },
      h("h2", null, section.title),
      h("ul", null,
        section.items.map((item) => h("li", { key: item }, item)),
      ),
    )),
  );
}

window.ReactDOM.createRoot(document.getElementById("root")).render(h(App));
