from __future__ import annotations

from pathlib import Path
import shutil

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import BaseDocTemplate, Frame, Image, KeepTogether, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf"
PUBLIC = ROOT / "apps" / "web" / "public" / "guides"
LOGO = ROOT / "apps" / "web" / "components" / "assets" / "gridflow-logo.png"

NAVY = colors.HexColor("#0B1728")
BLUE = colors.HexColor("#1F67C7")
PALE = colors.HexColor("#EDF5FF")
TEXT = colors.HexColor("#152238")
MUTED = colors.HexColor("#5E6C82")
LINE = colors.HexColor("#DCE4EE")
GREEN = colors.HexColor("#167052")

font_dir = Path("/usr/share/fonts/truetype/dejavu")
if (font_dir / "DejaVuSans.ttf").exists():
    pdfmetrics.registerFont(TTFont("GF-Regular", str(font_dir / "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont("GF-Bold", str(font_dir / "DejaVuSans-Bold.ttf")))
    REGULAR, BOLD = "GF-Regular", "GF-Bold"
else:
    REGULAR, BOLD = "Helvetica", "Helvetica-Bold"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="GFTitle", fontName=BOLD, fontSize=29, leading=33, textColor=TEXT, spaceAfter=9))
styles.add(ParagraphStyle(name="GFSubtitle", fontName=REGULAR, fontSize=11, leading=17, textColor=MUTED, spaceAfter=16))
styles.add(ParagraphStyle(name="GFEyebrow", fontName=BOLD, fontSize=7.5, leading=10, textColor=BLUE, tracking=1.3, spaceAfter=8))
styles.add(ParagraphStyle(name="GFH1", fontName=BOLD, fontSize=19, leading=23, textColor=TEXT, spaceBefore=8, spaceAfter=10))
styles.add(ParagraphStyle(name="GFH2", fontName=BOLD, fontSize=12.5, leading=16, textColor=TEXT, spaceBefore=7, spaceAfter=5))
styles.add(ParagraphStyle(name="GFBody", fontName=REGULAR, fontSize=9.1, leading=14.2, textColor=TEXT, spaceAfter=7))
styles.add(ParagraphStyle(name="GFSmall", fontName=REGULAR, fontSize=7.8, leading=11.5, textColor=MUTED, spaceAfter=4))
styles.add(ParagraphStyle(name="GFCheck", fontName=REGULAR, fontSize=8.7, leading=13, textColor=TEXT, leftIndent=14, firstLineIndent=-10, spaceAfter=4))
styles.add(ParagraphStyle(name="GFCallout", fontName=REGULAR, fontSize=8.5, leading=13, textColor=TEXT))
styles.add(ParagraphStyle(name="GFCoverNote", fontName=BOLD, fontSize=8, leading=12, textColor=colors.white, alignment=TA_CENTER))


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, height - 15 * mm, width - 18 * mm, height - 15 * mm)
    if LOGO.exists():
        canvas.drawImage(str(LOGO), 18 * mm, height - 12.7 * mm, width=28 * mm, height=8 * mm, preserveAspectRatio=True, mask="auto", anchor="sw")
    canvas.setFont(REGULAR, 7)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(width - 18 * mm, height - 10.2 * mm, doc.title)
    canvas.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
    canvas.drawString(18 * mm, 9 * mm, "GridFlow · Connect. Manage. Grow.")
    canvas.drawRightString(width - 18 * mm, 9 * mm, f"{canvas.getPageNumber():02d}")
    canvas.restoreState()


def cover(title: str, subtitle: str, edition: str):
    logo = Image(str(LOGO), width=58 * mm, height=38 * mm, kind="proportional") if LOGO.exists() else Spacer(1, 12 * mm)
    badge = Table([[Paragraph(edition.upper(), styles["GFCoverNote"])]], colWidths=[48 * mm])
    badge.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), BLUE), ("BOX", (0, 0), (-1, -1), .5, BLUE), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return [Spacer(1, 18 * mm), logo, Spacer(1, 11 * mm), badge, Spacer(1, 12 * mm), Paragraph(title, styles["GFTitle"]), Paragraph(subtitle, styles["GFSubtitle"]), Spacer(1, 8 * mm), callout("Use this beside the interactive GridFlow Academy. Tick the practical checks as you complete them; never record passwords, verification codes or private provider keys in this document."), PageBreak()]


def callout(text: str, heading: str = "GRIDFLOW STANDARD"):
    table = Table([[Paragraph(heading, styles["GFEyebrow"]), Paragraph(text, styles["GFCallout"])]], colWidths=[38 * mm, 119 * mm])
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), PALE), ("BOX", (0, 0), (-1, -1), .6, colors.HexColor("#BBD5F5")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9)]))
    return table


def section(title: str, paragraphs: list[str], checks: list[str] | None = None):
    items = [Paragraph(title, styles["GFH1"])]
    items.extend(Paragraph(text, styles["GFBody"]) for text in paragraphs)
    if checks:
        items.extend(Paragraph(f"□ {item}", styles["GFCheck"]) for item in checks)
    items.append(Spacer(1, 3 * mm))
    return items


def step(number: int, title: str, body: str, details: list[str] | None = None):
    number_cell = Table([[Paragraph(f"{number:02d}", ParagraphStyle(name=f"N{number}-{title}", parent=styles["GFH2"], textColor=colors.white, alignment=TA_CENTER, spaceBefore=0, spaceAfter=0))]], colWidths=[12 * mm], rowHeights=[12 * mm])
    number_cell.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), BLUE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    copy = [Paragraph(title, styles["GFH2"]), Paragraph(body, styles["GFBody"])]
    if details:
        copy.extend(Paragraph(f"□ {item}", styles["GFCheck"]) for item in details)
    block = Table([[number_cell, copy]], colWidths=[16 * mm, 141 * mm])
    block.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("LINEBELOW", (1, 0), (1, 0), .4, LINE)]))
    return KeepTogether([block, Spacer(1, 2 * mm)])


def build_pdf(filename: str, title: str, subtitle: str, story):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT / filename
    doc = BaseDocTemplate(str(output_path), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=22 * mm, bottomMargin=19 * mm, title=title, author="GridFlow")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
    doc.addPageTemplates([PageTemplate(id="GridFlow", frames=[frame], onPage=header_footer)])
    doc.build(cover(title, subtitle, "2026 operational edition") + story)
    shutil.copy2(output_path, PUBLIC / filename)


linkedin_story = []
linkedin_story += section("The outcome", ["A sponsor should understand who you are, what you are building, why your work is credible and how to start a conversation within about thirty seconds. LinkedIn is your professional front door; GridFlow helps you prepare it but never controls the account."])
linkedin_story.append(callout("Only use facts you can defend. Do not imply a current team, championship, sponsor, result, audience size or relationship that is not accurate.", "ACCURACY RULE"))
linkedin_story += [Spacer(1, 4 * mm)]
linkedin_story.append(step(1, "Create the account", "Open https://www.linkedin.com/signup. Use your real first and last name, an email you control and a unique password. Complete LinkedIn's verification inside LinkedIn.", ["Add a recovery email or phone that you control.", "Never paste the password or verification code into GridFlow.", "If an account already exists, recover it instead of creating duplicates."]))
linkedin_story.append(step(2, "Photo, banner and location", "Use a clear, recent headshot. Add a clean racing or programme banner you have the right to publish. Set the region where you are professionally active.", ["Face remains recognisable when the photo is small.", "No expired sponsor logos or unlicensed artwork.", "Banner still reads clearly on mobile."]))
linkedin_story.append(step(3, "Write the headline", "Use: current role or series | programme or ambition | credible commercial themes. Example: GT Racing Driver | Building a European endurance programme | Performance, technology and brand partnerships.", ["More specific than 'Racing Driver'.", "No unsupported claims such as champion, elite or global.", "Readable without abbreviations a sponsor may not know."]))
linkedin_story.append(PageBreak())
linkedin_story.append(step(4, "Write the About section", "Write in first person and use four short blocks: current programme; evidence-backed journey; audience/access/content value; invitation to connect.", ["Programme and goals are current.", "Results and milestones can be verified.", "Partnership value is concrete, not generic.", "Final sentence makes the next conversation easy."]))
linkedin_story += section("About template", ["I compete in [series/category] with [team/programme], currently focused on [current objective].", "My journey includes [two or three verified milestones]. I bring [relevant audience, geography, access, content capability or technical insight] to the work around the track.", "I am interested in partnerships where [shared business or brand objective] can create credible stories and measurable value.", "Connect with me to discuss motorsport, performance and a collaboration built around shared objectives."])
linkedin_story.append(step(5, "Experience and results", "Create an Experience entry for your current role as a driver or athlete. Add accurate dates, team/programme, series, responsibilities, selected results and partnership activity.", ["Current entry has start date and accurate title.", "Older entries show progression without repetition.", "Achievements name the event, year and outcome."]))
linkedin_story.append(step(6, "Featured proof", "Choose a small set of proof: race reel, media kit, official result, credible press, website or sponsor case study. Test each link in a private browser tab.", ["Every link opens without requesting private access.", "Thumbnail and title are professional.", "Old or weak evidence is removed."]))
linkedin_story.append(PageBreak())
linkedin_story.append(step(7, "Skills, education and recommendations", "Place the three most commercially useful skills first, then add honest supporting skills. Include relevant licences, education and certifications. Request recommendations only from people who can speak to real work.", ["Motorsport/performance skill included.", "Partnership/content/public-speaking skills included where true.", "No keyword stuffing."]))
linkedin_story.append(step(8, "Custom URL and visibility", "On desktop: Me > View Profile > Public profile & URL > edit the custom URL. Use a variation of your name or professional brand. Review which sections are public.", ["URL begins linkedin.com/in/ and is easy to share.", "Public sections match your intent.", "Public email/phone exposure is deliberate, not accidental."]))
linkedin_story.append(step(9, "Two-factor authentication", "Open Settings & Privacy > Sign in & security > Two-factor authentication. LinkedIn recommends an authenticator app as the preferred method. Store recovery access safely.", ["Two-factor authentication enabled.", "Recovery method tested and controlled by you.", "No code saved in GridFlow, email drafts or screenshots."]))
linkedin_story.append(step(10, "First-week professional routine", "Connect with people you genuinely know, follow target companies, add current proof and make a small number of thoughtful interactions. Then use GridFlow to research before preparing LinkedIn notes.", ["No mass connection requests.", "Each note has a real reason for the connection.", "You perform every LinkedIn action yourself."]))
linkedin_story += section("Final profile review", ["Read the profile aloud. Remove jargon, repetition and claims that sound generic. View it while signed out or in a private tab. Check spelling, dates, working links and mobile layout. Paste the final public URL into GridFlow onboarding."], ["Identity is accurate.", "Headline and About sound human.", "Evidence links work.", "Visibility is deliberate.", "Two-factor authentication is active."])

launch_story = []
launch_story += section("Before you begin", ["Have your racing programme facts, target geography, preferred industries, rough partnership range, LinkedIn public URL and - if your plan asks for it - a Gemini API key ready. Do not collect secrets in notes or screenshots."])
for number, title, body, details in [
    (1, "Complete the system introduction", "Review what GridFlow prepares and what remains under human control.", ["LinkedIn remains user-performed.", "Messages and commercial commitments follow approval gates."]),
    (2, "Calibrate the athlete profile", "Add programme, series, countries, goals, achievements, differentiators and audience context.", ["All results are accurate.", "Target countries reflect realistic access."]),
    (3, "Finish LinkedIn", "Create or audit the full profile using the LinkedIn Profile Playbook, paste the public URL and confirm all eight foundations.", ["Headline and About copied into LinkedIn.", "Featured evidence opens.", "Two-factor authentication enabled."]),
    (4, "Set target strategy", "Choose preferred and excluded industries, sponsor countries and an honest useful partnership range.", ["No prohibited or unsuitable sectors.", "Range matches the programme's current value."]),
    (5, "Confirm operating controls", "Keep LinkedIn-first, draft-only email and approval for every message until you have evidence to change them.", ["Timezone correct.", "Daily cap deliberate.", "Provider connection verified if required."]),
    (6, "Take the Academy tutorial", "Follow LinkedIn, QuickFind and the full company-to-renewal walkthrough. Open each workspace from the lesson.", ["You can explain Atlas, Sage, Relay and Echo.", "You know where failures and approvals appear."]),
    (7, "Activate one Discovery Brief", "Start narrow: one region, a few industries and a modest company count. Run the full pipeline once.", ["Brief is active.", "Search theme is specific.", "Run appears in Research Runs."]),
    (8, "Review company evidence", "Open a researched company and check sources, dates, fit score and partnership angle.", ["Weak claims removed.", "Domain and identity correct.", "Decision-maker search status understood."]),
    (9, "Test QuickFind", "Search the researched company by name. Confirm the result points to the same company and ranks a real stored contact.", ["Verification label visible.", "Unknown values stay unknown.", "No cross-organisation result."]),
    (10, "Prepare - but do not blindly send - outreach", "Open the recommended contact and Echo draft. Check every claim, relevance, tone and call to action.", ["LinkedIn profile is the correct person.", "Note is brief and personal.", "You perform the LinkedIn action yourself."]),
]:
    launch_story.append(step(number, title, body, details))
launch_story.append(PageBreak())
launch_story += section("Launch-ready evidence", ["GridFlow is ready for normal use when the setup checklist is complete, a real pipeline run succeeds, company evidence has been reviewed, QuickFind returns the expected stored contact and a human has reviewed the first outreach draft. Production launch still requires the separate Launch Control acceptance evidence and legal review marked in the application."], ["Profile complete", "LinkedIn complete", "Provider ready", "Brief active", "Pipeline succeeded", "Company reviewed", "QuickFind checked", "Outreach draft reviewed"])

workflow_story = []
workflow_story += section("The operating principle", ["GridFlow is a connected commercial record. Each stage should reuse verified information from the previous stage. Automation handles preparation and internal coordination; a person controls relationships, sending, meetings, deal stages, prices, signatures and payments."])
workflow_story.append(callout("QuickFind is an instant view of existing researched records. It is not a live people-search engine and does not invent or infer an email address.", "QUICKFIND"))
for number, title, body, details in [
    (1, "Profile and LinkedIn", "Create the truthful athlete and commercial context that later tools can reuse.", ["Maintain the LinkedIn public URL.", "Refresh programme facts when the season changes."]),
    (2, "Discovery Briefs", "Define region, industries, theme and company volume. Activate only focused strategies.", ["One clear mission per brief.", "Start small and review quality."]),
    (3, "Atlas", "Discovers plausible sponsor companies for the active brief and records why each may fit.", ["Check identity and domain.", "Reject irrelevant companies."]),
    (4, "Sage", "Researches public evidence and scores commercial fit. Scores prioritise review; they are not facts.", ["Open sources.", "Check dates.", "Remove unsupported claims."]),
    (5, "Relay and QuickFind", "Relay identifies plausible decision-makers and records verification, provenance and available channels. QuickFind ranks these stored contacts by company name.", ["Never guess email patterns.", "Confirm current role before contact."]),
    (6, "Echo and outreach", "Echo prepares a personalised draft from approved context. LinkedIn is the default first channel.", ["Human edits and approves.", "Human performs LinkedIn action.", "Record the real outcome."]),
    (7, "Pulse, Sentinel and Nova", "Pulse times safe follow-ups. Sentinel classifies replies and stop signals. Nova prepares response strategy.", ["Replies and opt-outs stop sequences.", "Uncertain classifications get review."]),
    (8, "Opportunities and Orbit", "Create an opportunity only after meaningful qualification. Orbit prepares and debriefs real meetings.", ["Stage and value stay honest.", "Next action always has an owner and date."]),
    (9, "Forge and Seal", "Forge prepares proposal packages from a real opportunity. Seal controls exact contract versions, signers and payment schedules.", ["Human approves terms.", "External signature/payment evidence is verified."]),
    (10, "Delivery and Renewals", "Delivery tracks obligations and evidence against the active contract. Renewals use verified performance plus human-recorded sponsor feedback.", ["No invented delivery proof.", "Freshness checked before renewal handoff."]),
]:
    workflow_story.append(step(number, title, body, details))
workflow_story.append(PageBreak())
workflow_story += section("QuickFind decision guide", ["Best match means the highest-ranked stored contact for that company. Prefer a primary contact whose role relates to partnerships, marketing, commercial leadership or - at a small business - executive ownership. Verification and confidence should inform your review, not replace it."])
quick_table = Table([
    [Paragraph("Situation", styles["GFH2"]), Paragraph("Correct next action", styles["GFH2"])],
    [Paragraph("Company and verified contact found", styles["GFBody"]), Paragraph("Open LinkedIn, confirm the person is current, then review the contact record and outreach context.", styles["GFBody"])],
    [Paragraph("Company found; contact unknown", styles["GFBody"]), Paragraph("Open the company and run or retry Relay through the controlled pipeline.", styles["GFBody"])],
    [Paragraph("Company not found", styles["GFBody"]), Paragraph("Create or refine a Discovery Brief and let Atlas research it with evidence.", styles["GFBody"])],
    [Paragraph("Email missing", styles["GFBody"]), Paragraph("Keep it unknown. Use the verified LinkedIn-first path or conduct lawful source research.", styles["GFBody"])],
], colWidths=[53 * mm, 104 * mm])
quick_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), PALE), ("GRID", (0, 0), (-1, -1), .5, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
workflow_story.append(quick_table)
workflow_story += [Spacer(1, 5 * mm)] + section("Daily operating rhythm", ["Start in Command Centre. Resolve urgent human decisions first, then failures and broken integrations, then overdue relationship work. Use QuickFind when a company comes up in conversation. Finish by recording real outcomes so the next recommendation is based on truth."], ["Review Approval Inbox", "Check replies and stop signals", "Open today's next actions", "Record LinkedIn actions and meetings", "Keep company/contact facts current"])

build_pdf("gridflow-linkedin-playbook.pdf", "LinkedIn Profile Playbook", "A complete, sponsor-ready LinkedIn setup for racing drivers and athletes.", linkedin_story)
build_pdf("gridflow-launch-checklist.pdf", "GridFlow Launch Checklist", "The shortest safe path from a new account to a reviewed sponsor workflow.", launch_story)
build_pdf("gridflow-workflow-handbook.pdf", "Commercial Workflow Handbook", "QuickFind and the complete research-to-renewal operating model.", workflow_story)
print("Generated 3 GridFlow user guides")
