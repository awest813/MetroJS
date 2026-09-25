# OpenPublica — City strategies and gameflow: audit and plan

**Date:** 2026-09-25
**Base:** all gap slices through AH ([NEXT_GAPS_PLAN.md](./NEXT_GAPS_PLAN.md)).

The earlier audits asked whether each system works. This one asks two different questions:

- **Strategy:** do different ways of building a city lead to different, fair outcomes?
- **Gameflow:** does play have a shape — an opening, a middle, goals, and an ending?

---

## 1. Verdict

A careful player can build a thriving town from the default $10,000. The opening coach works: houses appear in the first month, and careful play beats careless play by 2.5×.

But the game has no goals, and its score ranks failure above success. One strategy — mixed-use zoning — beats the others with about twice the people and four times the money. Taxes up to 11% are nearly free money, while at 12% a town loses most of its people. A new player's natural first move, the plant beside the first street, stalls the town for years. Bankruptcy never ends. After year 5–7 there is nothing left to decide, while the treasury climbs past $240,000.

The plan in section 6 is in four parts:

1. Measure strategies in the repo.
2. Balance the choices: taxes, mixed use, small-town services.
3. Guide the opening: plant smog, steadier advice.
4. Give the game an arc: a rating that means success, milestones, late civic buildings, a bankruptcy ending, and new-game options.

---

## 2. How it was measured

A scripted player plays the game from a new city: the default map (seed 2026), $10,000, and the real tools and prices. It lives in `src/scenarios/strategyPlayer.ts`; `npm run strategies` (in `openpublica/`) prints the tables in sections 3 and 4, and `test/strategyBalance.ts` holds the balance bands. It works like this:

- **Layout:** it builds on the north-west bank on a grid of 8-tile blocks, each ringed by an arterial road. Each block is zoned as one 7×6 area, with the zone tool's own streets. One strip per block is kept for services. There is room for 16 blocks.
- **Expanding:** it adds the next block when fewer than 12 empty lots could grow, and only when it can pay for the block.
- **Industry:** in most strategies, factories and plants go in a district on the south bank, joined to town by a street along the west edge.
- **Services:**
  - A plant when the grid is 85% full or growth waits for power.
  - A water tower at 40 residents, or when 5 or more buildings are dry.
  - A fire station when fire cover drops below 20.
  - A police station when crime reaches 30.
  - Each service only while the budget can carry its upkeep (net stays positive, or 5 years of savings cover it).
- **Money:** it takes a bond only when in debt, and leaves taxes alone unless the strategy says otherwise.
- **Other players:**
  - The *advice-follower* builds every service the advisories ask for, whatever the budget.
  - The *naive* player puts the plant beside the first street and factories next to the houses, as the coach leads a new player to.

Each run is 20 simulated years with seeded growth dice.

Caveats:

- It is one map and one scripted player.
- The player uses the north-west bank only, so the plateaus reflect that land, not the whole map.
- Times are simulated months. At 1× a month is 30 seconds, so five years is 30 minutes.
- Each strategy rolls one set of growth dice, so a single run can swing: the 12% town ends with 140 people on these dice and about 400 on others. Read small differences as noise; the balance test checks relationships with margins.
- Two bugs in the first draft of the script (a link road that missed town, and a zone mix that fell back to housing) were fixed before these numbers were taken.

---

## 3. Strategies

Population, money, monthly net, and score at year 10:

| Strategy | What it does | Pop y5 | Pop y10 | Money y10 | Net/mo | Score |
|---|---|---:|---:|---:|---:|---:|
| Balanced | Houses and shops in town, factory district across a link road, 9% taxes | 576 | 700 | $96,787 | +$1,366 | 47 |
| Advice-follower | The same, building every service the advisories ask for | 640 | 724 | $88,657 | +$1,256 | 48 |
| Suburb | Mostly houses, highway rings | 832 | 808 | $52,737 | +$1,124 | 53 |
| Houses, then mixed use | First block houses, then mixed use and shops | 1,499 | 1,354 | $376,088 | +$3,790 | 47 |
| … with trolleys and parks | The same on trolley avenues, a park per block | 1,734 | 1,738 | $342,871 | +$3,697 | 47 |
| Mixed use first | Mixed use from the first block | 0 | 0 | −$18,726 | −$1,718 | 57 |
| Industry late | Factory district every third block, industry tax 5% | 588 | 788 | $72,856 | +$1,147 | 48 |
| Industry early | Factory district as the second block | 92 | 84 | −$19,455 | −$1,538 | 12 |
| No services | No police, fire, or water | 360 | 448 | $82,995 | +$1,082 | 37 |
| Naive | Plant beside the first street, factories next to the houses | 352 | 276 | $20,600 | +$37 | 44 |
| Tiny | Two blocks, then stop | 80 | 88 | −$870 | −$1,097 | 41 |
| Houses only | No shops or factories | 36 | 76 | −$47,584 | −$1,844 | 52 |

The same balanced town at different tax rates (all three taxes):

| Taxes | 7% | 9% | 10% | 11% | 12% | 13% | 12% housing only |
|---|---:|---:|---:|---:|---:|---:|---:|
| Pop y10 | 644 | 700 | 640 | 656 | 140 | 48 | 388 |
| Money y10 | $16,778 | $96,787 | $126,828 | $158,363 | −$1,165 | −$14,414 | $9,455 |
| Net/mo y10 | +$406 | +$1,366 | +$1,638 | +$2,129 | −$1,265 | −$1,631 | −$517 |
| Score y10 | 47 | 47 | 38 | 29 | 0 | 13 | 40 |

The verdicts:

| Strategy | Verdict |
|---|---|
| Balanced, advice-follower | Viable, and the reference point. |
| Suburb | Viable, with its own shape: the most people for a mostly-houses town, the least money. |
| Industry late | Viable: the most jobs (1,911). |
| Houses, then mixed use | Dominant: about 1.9× the balanced town's people and 3.9× its money (2.5× the people on trolley avenues), with no trade-off. |
| Mixed use first | Broken: nobody ever moves in. |
| Industry early, tiny | Broken: bankrupt. |
| No services | Weaker, as it should be. |
| Houses only | Fails, as it should, but see the score. |
| 11% taxes | Nearly free: 6% fewer people than at 9%, and 1.6× the money. |
| 12% and up | A cliff, not a slope. |

---

## 4. Gameflow

The careful balanced town, month by month:

| | When | What happens |
|---|---|---|
| Opening | Months 1–3 | Street, zones, and plant are done in the first minute. The first houses grow in month 1, and 100 people by month 3–9. |
| Tight | Months 1–13 | Money falls to its low of $4,951 at month 13. The budget runs positive from month 7. |
| Building out | Years 1–6 | The town adds blocks, a plant, a tower, and fire and police as it can pay. Money is back to $10,000 by month 34. |
| Plateau | Year 5 on | The town reaches 90% of its peak population by month 63; the last block goes in at month 79. |
| Watching | Year 6 on | Nothing left to do. Money reaches $97,000 at year 10 and $241,000 at year 20; the mixed-use town reaches $910,000. |

How many months each year the player did anything:

| Year | 1 | 2 | 3 | 5 | 10 | 20 |
|---|---:|---:|---:|---:|---:|---:|
| Balanced | 7 | 2 | 4 | 3 | 0 | 0 |
| Mixed use | 8 | 4 | 3 | 4 | 0 | 0 |

At 1× the decisions fit in the first 30–40 minutes. After that the player watches.

---

## 5. Findings

**F1 — No goals.** Nothing asks the player for anything beyond not failing. There are no milestones, city tiers, unlocks, or scenario goals, and all five services are available from the first minute. The score is the only target on screen.

*Addressed in part by G8 (Gap AO).* The city now climbs four tiers, each with a grant:
- **Tiers:** Village (150 people, rating 50), Town (400, 60), City (600, 65), and Capital (1,000, 70). Each needs no debt, and from Town on jobs for half the people.
- **Tuning:** City and Capital are lower than first planned (900 and 1,500), because the balanced town levels off near 700 on its land.
- **Pace:** the careful towns reach Village in year 1, Town by year 3, and City by year 5. The naive and houses-only towns stop at Village.
- **HUD:** it shows the next tier's progress and what is missing, and a banner marks each tier reached.
- **Still to come:** unlocks (G9) and scenario goals (G11).

**F2 — The score ranks failure above success.** The score starts at 100 and only subtracts: pollution, crime, jams, taxes over 9%, dark buildings, missing fire and water cover, and debt. Nothing adds for people, happiness, services reached, or a healthy budget. The results are upside down:

- The houses-only town scores 80–85 in its first three years, and still 52 at year 10 while $47,584 in debt.
- The tiny town scores 74–77.
- The thriving towns score 47–53.

The score also drives nothing in the game.

*Addressed by G7 (Gap AN).* The score is now a city rating (Rating in the HUD) of four parts worth up to 25 each, less problems:
- **Parts:** size (population on a log scale, full at 2,000 people), a quarter of happiness, services (the share of zone buildings powered, and past 40 residents also watered and in fire reach), and budget (a balanced budget and $1,000 in hand).
- **Problems:** a quarter of the smog, a point for each point of each tax over 9%, 10 with no plant, and at least 15 in debt. A city in debt rates 40 at best.
- **Result at year 10:** the thriving towns rate 71–80, the naive town 64, the town without services 57, and the bankrupt towns 20–35. A new city starts at 50.
- **Tooltip:** hovering the rating lists its parts.

**F3 — Mixed use dominates.** On the same land at the same prices, a houses-then-mixed-use town has about 1.9× the balanced town's people and 3.9× its money; on trolley avenues, 2.5× the people. Mixed use wins on every count:

- Its smallest building houses 6 people and 2 jobs, against a house's 4 people.
- It grows 1.3× faster.
- It makes its own jobs, so it never runs short of work.
- It adds walkability, and it makes no smog.

**F4 — Mixed use cannot open a town.** A town zoned only mixed use, or only shops, stays empty. Shop demand needs residents, and mixed use needs shop demand. The advisory explains it ("Shops wait for residents"), but a walkable mixed-use town is not something you can start with.

*F3 and F4 were fixed by G3 (Gap AK).* Two changes took most of mixed use's edge:
- **Street life stops stacking.** Each lot now takes only the strongest walkable neighbour's land-value bonus. It used to add up every one in reach, so a mixed block could lift its own land to the top tier.
- **Main-street premium.** Mixed buildings need 15 more land value than houses or shops to build larger, and the smaller mixed buildings are trimmed.

A town can now start with mixed use.

| Year 10 | Balanced | Houses then mixed | … with trolleys and parks | Mixed use first |
|---|---:|---:|---:|---:|
| Before: people | 700 | 1,354 (1.9×) | 1,738 (2.5×) | 0 |
| After: people | 700 | 961 (1.37×) | 1,370 (1.96×) | 998 (100 by month 3) |
| After: money | $96,787 | $190,730 (2.0×) | $212,934 | $208,842 |

The houses-then-mixed town now has walkability 46 against 1 and happiness 88 against 76. It banks about twice the balanced town's money because it fills its land faster; its monthly net at year 10 is 1.5×. Mixed use with trolleys and parks is the strongest combination left. It costs the most up front: trolley rings bankrupt a balanced town that tries them.


**F5 — Taxes: free up to 11%, a cliff at 12%.**

- From 9% to 11% profit rises by half ($1,366 to $2,129 a month at year 10) for 6% fewer people. The other cost is score, which does nothing.
- At 12% the town shrinks to a fifth of its size (140 people against 700 at year 10) and runs into debt.
- A 12% housing tax alone costs 45% of the people and puts the budget in the red.

The cause is the housing-demand step. Each point over 9% takes 2 a month, and jobs outnumbering homes add 5, so at 12% and above housing demand falls every month even while jobs outnumber homes. Meanwhile the deficit advisory says "raise taxes" with no limit, and the tax tooltip describes a gentle slope.

*Fixed by G2 (Gap AJ).* Taxes no longer drain demand. Each point over 9% turns away 7% of newcomers and leaves 4% of places empty, for all three taxes. The same sweep now reads:

| Taxes | 5% | 7% | 9% | 10% | 11% | 12% | 13% | 15% | 17% | 20% |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Pop y10 | 372 | 668 | 700 | 625 | 596 | 542 | 584 | 519 | 432 | 365 |
| Money y10 | −$38,428 | $16,796 | $96,787 | $138,957 | $125,053 | $139,499 | $151,558 | $141,164 | $138,089 | $122,211 |

Population falls smoothly as taxes rise, money levels off past about 13% and falls by 20%, and no rate from 7% to 20% puts the careful town in debt. At 5% the taxes cannot cover upkeep.

**F6 — The first plant is a trap.** The coach says to place the plant "beside the street". The natural spot is next to the first houses. A plant's smog is 60 at the stack and reaches 8 tiles, and factory smog adds up (45 each, 7 tiles), so a factory block next door pushes lots past the level that drives homes out.

- The naive town stalls at 200–390 people for six years, against 700.
- Its top advisory changes 37 times in months 5–71, cycling through crime, smog, "restore power, demand, or road access", smog spike, and back.
- It is never told plainly that its plant sits among its houses.

*Addressed by G5 (Gap AM).*
- **Plant tool:** hovering it tints the homes and shops its smog would reach, and the status line warns: "Plant here: its smog would reach 30 homes and 13 shop lots, enough to drive 17 out — place it further from the houses."
- **Factory areas:** a factory zone area shows the same while you drag.
- **Coach:** it now says to place the plant away from the houses.
- **Result:** a naive player who heeds these warnings grows like a careful one: 724 people at year 10, against 276 for the naive player and 700 for the balanced one.

**F7 — Small towns cannot carry flat upkeep.** A two-block village of about 90 people cannot carry the upkeep of its plant, roads, and services, and slides into debt. The fire and water advisories begin at 40 residents. An early factory district across a link road also bankrupts a young town. The services and districts that make a big city work are all-or-nothing for a small one.

*Addressed by G4 (Gap AP).* A village now has cheap first tiers of three services, which it can upgrade in place later:
- **Tiers:** a water pump ($15 a month), a police post ($25), and a volunteer fire hall ($20).
- **Advice:** it names the cheap tier until the budget carries the full one.
- **Upgrade:** placing the full tier on the small one costs the difference in price.
- **Result:** the tiny town stays solvent for 20 years (lowest $1,856). The advice-follower's lowest treasury is $5,936.

**F8 — Bankruptcy never ends.** A bankrupt city runs on indefinitely:

- The houses-only town spent 186 of 240 months in debt and reached −$124,501.
- Bonds (three at most, each repaid over two years) only delay it.
- In debt it cannot place the plant it needs to grow again, so it cannot climb out.

Nothing stops the city or rescues it.

*Addressed by G10 (Gap AQ).* Debt now has an ending:
- **A year in:** the council cuts police, fire, and road funding to the minimum and holds it there until the city is out of the red.
- **Two years in:** the game pauses on a recap. The state's bailout clears the debt and the bonds, holds taxes at 12% for five years, and costs 10 rating while the terms run. The other choice is a new city.
- **Advice:** it counts down to both, and names the biggest costs.
- **Result:** no harness city stays in debt more than 24 months in a row. Houses-only takes two bailouts in 20 years, and the 5%-tax town recovers under the council's cuts alone.

**F9 — The game ends without saying so.** From year 6 the careful player has nothing to decide. Money piles up with nothing to buy, and the map's land is spoken for.

*Addressed in part by G9 (Gap AR).* Milestones now unlock things to buy, each costly to run:
- **Town:** a gas plant and a clinic.
- **City:** a college and a stadium.
- **Capital:** a city hall.
- **Result:** at year 10 the balanced town has spent $58,800 on them and kept $58,937, with civic upkeep taking 53% of its monthly surplus. It used to hold $113,377 with nothing to buy.

**F10 — The advice order contradicts its own design.** At 44 residents and no jobs, the first message after the coach is "Fire coverage is thin" rather than "Zone shops". The code says the jobs lesson comes first (`JOBS_GAP_POPULATION`), but the fire advisory is pushed ahead of it.

*Fixed by G6 (Gap AL).* At 44 people and no jobs, the first advice is now "Zone shops". The advice also holds still. Without player edits, the naive town's advisory changes at most about every three months (13 times in months 37–72); edits that bring up a new trouble still show it at once. Every advisory with a place is a link that jumps the camera there.

**What works, and must survive the changes:**

- The opening gets a first town growing in month 1.
- Careful play beats naive play by 2.5×.
- Services matter: 448 people without them against 700 with them.
- Suburb and industry-late are real alternatives with their own shape.
- Taxes up to 11% are a lever — only too cheap a one.

---

## 6. Plan

Principles:

1. Every viable strategy lands in a band around the others on its main measure, and pays for its strength somewhere else.
2. The rating ranks cities the way a player would.
3. There is always a next goal.
4. Failing ends the game or is rescued; it never runs forever.

Slices are named G1–G11 here and become gap letters as they ship. Each has an exit a test or the scripted player can check.

### Part A — Measure

| Slice | Change | Exit |
|---|---|---|
| **G1 Strategy harness** (shipped as Gap AI) | Move the scripted player into `src/scenarios/strategyPlayer.ts`, with its policies (careful, advice-follower, naive) and the strategy table. `npm run strategies` prints the tables in sections 3 and 4. A Jest test holds the balance bands below, so later passes cannot move them silently. | The tables above come out of the repo. The test starts with the current bands and tightens as Parts B–D land. |

### Part B — Balance the choices

| Slice | Change | Exit |
|---|---|---|
| **G2 Honest taxes** (shipped as Gap AJ) | Take the tax term out of the monthly demand step. Instead, scale the demand people act on by a tax draw, as happiness already does: about 7% less per point over 9%, about 5% more per point under, between 0.3× and 1.3×. Demand still follows jobs, so no rate empties a town on its own. The deficit advisory suggests a specific raise with its monthly gain, and warns past 11%. The tooltips state the real effect. | In the harness tax sweep from 7% to 13%, population at year 10 falls smoothly (at most 12% per point) and no rate bankrupts a careful player. 11% costs visible growth against 9%. |
| **G3 Mixed use with a trade-off** (shipped as Gap AK) | The smallest mixed building houses 4 people and 1 job (a flat over a shop). Drop the 1.3× growth boost. Mixed lots grow only on land worth at least 35 (a main-street premium) or beside existing houses or shops. Their trips load the streets like shops' do. | Houses-then-mixed within +30% of the balanced town on population and money, and ahead on walkability and happiness. |
| **G3b Mixed use can open a town** (shipped with Gap AK) | While nobody lives in town, a mixed lot grows as flats: its housing half grows on the starter demand, and the shop half opens as residents arrive. | A mixed-use-first town reaches 100 people in year 1. |
| **G4 Small-town services** (shipped as Gap AP) | Cheaper first tiers: a volunteer fire hall and a water pump, at about half the price, reach, and upkeep. The fire and water advisories name the cheap tier until the budget can carry the full one. | The tiny village stays solvent. The advice-follower's cash low stays above $3,000. |

### Part C — Guide the opening

| Slice | Change | Exit |
|---|---|---|
| **G5 Plant smog in view** (shipped as Gap AM) | The plant tool previews its smog reach and warns when homes or housing lots fall inside it ("12 homes would breathe this plant's smog"). The coach says "beside a street, away from the houses". An industrial zone area shows which housing lots its factories would smog. | In the browser, placing a plant beside the first houses shows the warning. A naive-player variant that heeds it reaches at least 80% of the balanced town's population. |
| **G6 Steadier, located advice** (shipped as Gap AL) | Keep the top advisory for at least 3 months unless something more urgent appears. Name where the trouble is, with a jump like Inspect's. Put the jobs lesson ahead of fire and water, as `JOBS_GAP_POPULATION` intends (F10). | The naive run's top advisory changes at most once per 3 months, except for urgent ones. At 44 people and no jobs, it says to zone shops. |

### Part D — Give the game an arc

| Slice | Change | Exit |
|---|---|---|
| **G7 A rating that means success** (shipped as Gap AN) | Replace the subtract-only score with a city rating built from happiness, services reached, budget health (positive net, no debt) and size (population tier, on a log scale), less today's penalties. The HUD tooltip shows the parts. | Across the harness, thriving towns (balanced, suburb, mixed, industry late) rate above naive, and naive above bankrupt. No bankrupt town rates above 40. |
| **G8 Milestones** (shipped as Gap AO) | City tiers: Village at 150 people, Town at 400, City at 900, Capital at 1,500 (tuned to the 64-tile map after G3). Each needs population, a rating bar, and no debt. Reaching one pays a one-time grant, shows a banner, and unlocks the next civic building (G9). The HUD shows progress ("Town: 312/400 people, rating 58/60"). | The careful player reaches Village in year 1, Town by year 3, and City by year 7. The naive player stalls earlier, and the tooltip says why. |
| **G9 Late civic buildings** (shipped as Gap AR) | New buildings unlocked by milestones, each costly to build and run, each with a city-wide effect. For example: a gas plant (cleaner, bigger) at Town; a clinic (happiness) at Town; a college (land value, office tier) at City; a stadium (happiness, shop demand) at City; a city hall (rating) at Capital. Models come from the generator. | At year 10 the careful town spends at least half its surplus on things it chose, against nothing now. It holds at most about 3 years of expenses unless it is saving for something. |
| **G10 Bankruptcy with an ending** (shipped as Gap AQ) | After 12 months in debt, the council cuts safety and road funding to the minimum, and the advice says so. The deficit advisory lists the biggest costs ("roads $783 a month"). After 24 months, a recap screen offers a state bailout (the debt cleared, taxes held at 12% for 5 years, a rating penalty) or a new city. | No harness city stays in debt more than 24 months. |

### Part E — Replay

| Slice | Change | Exit |
|---|---|---|
| **G11 New game and scenarios** | New city shows the random map, with a re-roll and a starting treasury: Easy $20,000, Normal $10,000, Hard $5,000. The test cities become scenarios with a goal and a deadline — for example, Troubled: get back to 300 people within 5 years; Sprawl: power the whole strip; Riverside: reach Town. Consider an 8× speed for the late game. | In the browser, the new-game choices work, and completing a scenario is detected and shown. |

### Order

**G1 → G2 → G3 / G3b → G6 → G5 → G7 → G8 → G4 → G10 → G9 → G11**

- Measure first, then balance the choices, so the rating and milestones are tuned on fair numbers.
- G6 is small and fixes advice that every later slice relies on.
- G9 is the largest slice (new buildings, models, effects), so it comes after the milestones that unlock it.

Balance bands for G1's test, tightened after Part B:

- Every viable strategy's population at year 10 is within ±30% of balanced, and its money within 0.5–2×.
- No careful strategy goes bankrupt. The naive player reaches at least half of balanced, and 80% after G5.
- The tax sweep is smooth: at most 12% of population per point.
- The rating ranks thriving above naive above bankrupt.

### Still out of scope

The Phase I list in NEXT_GAPS_PLAN.md stands. Disasters stay out, and so does the census graph window: milestones and the rating tooltip are not graphs. Map size stays at 64 × 64, so the milestone thresholds are tuned to it.

---

## 7. Verification

- G1's harness report matches sections 3 and 4 before any balance change, and meets the bands after Part B.
- Root `npm test` stays green, and the five test cities still build with nothing refused.
- In the browser:
  - Start a new city, place the plant beside the first houses, and see the smog warning.
  - Reach Village and see the banner.
  - Hover the rating to see its parts.
  - Run a town into debt for two years and meet the council.
