# AirMark Beta Tester Feedback Program
### Stakeholder Overview & Business Case

---

## Executive Summary

AirMark is launching a structured beta tester feedback program designed to capture real user input directly within the product, route it automatically into our development workflow, and close the loop with testers when their feedback ships. The program requires no third-party subscriptions, no new tools for testers, and is built entirely on infrastructure we already own and use.

---

## The Problem We Are Solving

Our current beta feedback process — a Google Form linked from an in-app button — has generated only 2 submissions. This is not a tester engagement problem. It is a friction and visibility problem:

- Testers are taken out of the app to fill out a form
- There is no confirmation that their feedback was seen
- There is no pipeline connecting feedback to our development sprints
- Our team has no systematic way to triage, prioritize, or act on submissions

The result is that we are running a beta program without the core benefit of a beta program: **real, structured user input shaping our product roadmap.**

---

## The Solution

We are building a three-part feedback system using tools we already use:

### Part 1 — In-App Feedback Modal
A lightweight feedback panel built directly into AirMark. Testers click the existing feedback button and a modal appears inside the app — they never navigate away. The modal captures:

- Feedback type (Bug / Feature Request / UX Issue)
- Title and description
- Steps to reproduce (for bugs)
- Severity level
- Browser, OS, and current screen — captured automatically in the background

### Part 2 — GitHub Issues Integration
On submission, AirMark automatically calls the GitHub API to create a structured, labeled issue in our existing repository. The issue arrives pre-formatted and tagged, ready for our team to triage and assign to a sprint. No manual copy-paste. No separate inbox to manage.

### Part 3 — Slack Notifications
The free GitHub + Slack integration notifies our `#airmark-beta-feedback` channel the moment a new issue is created, and again when it is resolved. Our team is already in Slack. No new tools, no new logins — feedback surfaces where our team already communicates.

---

## How It Works End to End

```
Tester submits feedback inside AirMark
        ↓
GitHub Issue auto-created and labeled
        ↓
Slack notifies #airmark-beta-feedback instantly
        ↓
Product Owner reviews and assigns to sprint
        ↓
Developer resolves and closes the issue
        ↓
Slack notifies team of resolution
        ↓
Tester is informed their feedback shipped
```

---

## How Feedback Connects to Development Sprints

This program is designed to integrate directly with our existing agile process. Feedback does not sit in a separate system — it becomes sprint work:

| Stage | Action | Owner |
|---|---|---|
| Submission | Tester submits via in-app modal | Beta Tester |
| Triage | Product Owner reviews GitHub Issues weekly, tags and prioritizes | Product Owner |
| Sprint Planning | Tagged issues pulled into sprint backlog | Product Owner + Dev Lead |
| Development | Dev resolves issue in normal workflow | Developer |
| Close the Loop | Tester notified when issue ships | Automated via Slack |

---

## Why This Approach

We evaluated several third-party feedback tools including Canny, Featurebase, and GitHub Discussions. Each had meaningful limitations for our use case — third-party costs, requiring testers to create new accounts, or pulling testers out of the app entirely.

The custom modal approach was chosen because:

- **Zero recurring cost** — built once on infrastructure we already own
- **Zero friction for testers** — no new accounts, no leaving the app
- **Zero workflow disruption for developers** — feedback arrives in GitHub exactly like any other issue
- **Full ownership** — we control the experience, the data, and the roadmap
- **Slack-native** — notifications surface in the tool our team already uses daily

---

## Investment Required

| Item | Type | Estimated Effort |
|---|---|---|
| In-app feedback modal | Frontend development | 1–2 days |
| GitHub API integration | Backend development | 1 day |
| GitHub + Slack app setup | Configuration | 1–2 hours |
| Product Owner triage process | Documentation | 2–3 hours |
| **Total** | | **~3–4 days dev time** |

There is no recurring cost. This is a one-time build.

---

## Interim Plan While Modal Is Being Built

To begin collecting feedback immediately — before development is complete — we will enable **GitHub Discussions** on our repository and share a direct link with beta testers. This requires no development work, goes live in under an hour, and gives us a real feedback signal while the full solution is built.

---

## Success Metrics

We will measure the effectiveness of this program by tracking:

| Metric | Target |
|---|---|
| Feedback submissions per week | 5+ per active tester |
| Feedback → sprint ticket conversion rate | 30–50% of submissions |
| Time from submission to triage | Under 5 business days |
| Tester retention across beta period | 80%+ active after 4 weeks |
| Features shipped from tester input | Reported each sprint retrospective |

---

## Timeline

| Milestone | Target |
|---|---|
| GitHub Discussions live (bridge) | Immediately |
| Feedback modal v1 complete | 2 weeks |
| GitHub API integration live | 3 weeks |
| Slack notifications configured | 3 weeks |
| First triage cycle complete | 4 weeks |
| First sprint with beta-driven tickets | Sprint after triage |

---

## Summary

This program turns our beta testers from passive users into active product collaborators. It eliminates the friction that killed our Google Form adoption, integrates seamlessly into our existing GitHub and Slack workflows, and gives our product team a direct, structured signal from the people using AirMark every day. The investment is three to four days of development time. The return is a continuous, low-cost source of ground-truth product intelligence.

---

*Prepared for stakeholder review — AirMark Product Team*
