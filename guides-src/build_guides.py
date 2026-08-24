#!/usr/bin/env python3
"""Build the three public Beasley guide PDFs.

The guides are deliberately text-led: there are no listing photographs or
market claims to maintain.  Edit the copy below, then run this file from the
repository root.  It writes the stable public filenames used by the API.
"""
from pathlib import Path
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, PageBreak,
    Paragraph, Spacer, Table, TableStyle, KeepTogether)
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfdoc import PDFDictionary, PDFName, PDFString
from reportlab.pdfgen.canvas import Canvas

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "guides"
OUT.mkdir(parents=True, exist_ok=True)

# Core brand information verified from https://withbeasley.com on 2026-08-24.
SITE = "https://withbeasley.com"
CONTACT = "beasleymotion@gmail.com  |  +1 (210) 915-7177"
INK, GOLD, PAPER, TAUPE, MUTED = "#15130F", "#A9834C", "#FAF7F1", "#DDD5C7", "#5C574E"

def p(text, style): return Paragraph(text, style)

def make_styles():
    s = getSampleStyleSheet()
    return {
        "eyebrow": ParagraphStyle("eyebrow", parent=s["Normal"], fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=HexColor(GOLD), spaceAfter=12, uppercase=True, tracking=1.2),
        "cover_kicker": ParagraphStyle("cover_kicker", parent=s["Normal"], fontName="Helvetica-Bold", fontSize=9, leading=13, textColor=HexColor(GOLD), alignment=TA_CENTER, spaceAfter=22),
        "cover_title": ParagraphStyle("cover_title", parent=s["Normal"], fontName="Times-Bold", fontSize=34, leading=38, textColor=white, alignment=TA_CENTER, spaceAfter=14),
        "cover_sub": ParagraphStyle("cover_sub", parent=s["Normal"], fontName="Helvetica", fontSize=12, leading=19, textColor=HexColor("#EEE8DD"), alignment=TA_CENTER),
        "h1": ParagraphStyle("h1", parent=s["Normal"], fontName="Times-Bold", fontSize=25, leading=29, textColor=HexColor(INK), spaceAfter=14),
        "h2": ParagraphStyle("h2", parent=s["Normal"], fontName="Helvetica-Bold", fontSize=11.5, leading=15, textColor=HexColor(INK), spaceBefore=12, spaceAfter=6),
        "body": ParagraphStyle("body", parent=s["Normal"], fontName="Helvetica", fontSize=10, leading=15.5, textColor=HexColor(MUTED), spaceAfter=8),
        "small": ParagraphStyle("small", parent=s["Normal"], fontName="Helvetica", fontSize=8.4, leading=12, textColor=HexColor(MUTED)),
        "quote": ParagraphStyle("quote", parent=s["Normal"], fontName="Times-Italic", fontSize=14, leading=21, textColor=HexColor(INK), leftIndent=12, rightIndent=12, spaceAfter=4),
        "cta": ParagraphStyle("cta", parent=s["Normal"], fontName="Times-Bold", fontSize=25, leading=30, textColor=white, alignment=TA_CENTER, spaceAfter=12),
        "cta_body": ParagraphStyle("cta_body", parent=s["Normal"], fontName="Helvetica", fontSize=10.5, leading=16, textColor=HexColor("#EEE8DD"), alignment=TA_CENTER),
    }

class GuideCanvas(Canvas):
    def __init__(self, *args, title="", **kwargs):
        super().__init__(*args, **kwargs); self.title = title; self._saved_page_states = []
    def showPage(self): self._saved_page_states.append(dict(self.__dict__)); self._startPage()
    def save(self):
        total = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            if self._pageNumber > 1:
                self.setStrokeColor(HexColor(TAUPE)); self.setLineWidth(.4); self.line(.72*inch, .55*inch, 7.78*inch, .55*inch)
                self.setFillColor(HexColor(MUTED)); self.setFont("Helvetica", 7.5)
                self.drawString(.72*inch, .36*inch, "BLAZE BEASLEY  /  SAN MIGUEL DE ALLENDE")
                self.drawRightString(7.78*inch, .36*inch, f"{self._pageNumber - 1:02d}")
            super().showPage()
        super().save()

def header(text, s): return [p(text.upper(), s["eyebrow"])]
def checklist(items, s):
    data = [[p("<font color='%s'>01</font>" % GOLD, s["small"]), p(item, s["body"])] for item in items]
    table = Table(data, colWidths=[.32*inch, 6.55*inch], hAlign="LEFT")
    table.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LINEBELOW", (0,0), (-1,-1), .35, HexColor(TAUPE)), ("BOTTOMPADDING", (0,0), (-1,-1), 8), ("TOPPADDING", (0,0), (-1,-1), 7)]))
    return table

def callout(title, text, s):
    t = Table([[p(title.upper(), s["eyebrow"])], [p(text, s["quote"])]], colWidths=[6.85*inch])
    t.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), HexColor("#F0EAE0")), ("BOX", (0,0), (-1,-1), .6, HexColor(GOLD)), ("LEFTPADDING", (0,0), (-1,-1), 18), ("RIGHTPADDING", (0,0), (-1,-1), 18), ("TOPPADDING", (0,0), (-1,0), 15), ("BOTTOMPADDING", (0,-1), (-1,-1), 15)]))
    return t

def cover(title, subtitle, s):
    t = Table([[Spacer(1, 1.25*inch)], [p("SAN MIGUEL DE ALLENDE  /  PRIVATE GUIDE", s["cover_kicker"])], [p(title, s["cover_title"])], [p(subtitle, s["cover_sub"])], [Spacer(1, 2.1*inch)], [p("BLAZE BEASLEY", s["cover_kicker"])]], colWidths=[7.2*inch], rowHeights=[1.25*inch, None, None, None, 2.1*inch, None])
    t.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), HexColor(INK)), ("VALIGN", (0,0), (-1,-1), "MIDDLE")]))
    return t

def cta(title, copy, s):
    link = f'<link href="{SITE}/#contact" color="#FFFFFF">Start a private consultation at withbeasley.com</link>'
    t = Table([[p(title, s["cta"])], [p(copy, s["cta_body"])], [Spacer(1, 10)], [p(link, s["cta_body"])], [Spacer(1, 8)], [p(CONTACT, s["cta_body"])]], colWidths=[6.85*inch])
    t.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), HexColor(INK)), ("LEFTPADDING", (0,0), (-1,-1), 28), ("RIGHTPADDING", (0,0), (-1,-1), 28), ("TOPPADDING", (0,0), (-1,0), 34), ("BOTTOMPADDING", (0,-1), (-1,-1), 30)]))
    return t

GUIDES = {
"sma-buyers-guide.pdf": ("The San Miguel Buyer’s Guide", "A considered approach to finding a home, from first priorities to the conversations that move a search forward.", [
    ("Begin with the life you want", "A San Miguel search is strongest when it begins with daily life, not a listing feed.", [
      ("Set your compass", "Name the things that will shape an ordinary Tuesday: walkability, quiet, outdoor space, hosting, work routines, views, access, and how often you expect to be here. Separate non-negotiables from preferences so the search can stay focused as you learn."),
      ("Explore with intention", "Each neighborhood has its own rhythm. Spend time on foot at different times of day, notice the streets around a home, and ask how a location feels when you are not simply visiting. A good shortlist is about fit, not a generic ranking."),
      ("Tour beyond the highlight reel", "On a tour, slow down. Consider natural light, room flow, street activity, storage, outdoor areas, and the condition of systems that matter to you. Ask for context around any feature you may need to maintain or update.")],
      ("A useful first brief", ["How will you use the home most of the year?", "Which daily conveniences matter most to you?", "What should a visit or virtual tour help you learn?", "Who should be part of your professional team?"])),
    ("From shortlist to informed next step", "A thoughtful purchase process makes room for questions.", [
      ("Ask for the right information", "Before moving forward, request a clear picture of the property, its documentation, utilities and services, community rules where applicable, and any planned work or operating considerations. Keep questions in writing and make a simple record of the answers."),
      ("Build the right team", "Your real estate advisor can coordinate the search and help you frame questions. For legal, tax, title, financing, immigration, residency, or notarial matters, consult qualified local professionals who can advise on your particular circumstances."),
      ("Keep the process personal", "For international buyers, distance does not need to make the process impersonal. Agree on how you will communicate, when you want updates, and what needs your review. A clear working rhythm makes decisions easier to manage.")],
      ("Due-diligence conversation starters", ["What records and documents should my qualified professionals review?", "What is included, excluded, or subject to further confirmation?", "What ongoing responsibilities should I understand?", "What information would change my decision?"]))]),
"sma-sellers-playbook.pdf": ("The San Miguel Seller’s Playbook", "A practical, polished framework for preparing, presenting, and navigating a sale with care.", [
    ("Prepare the home and the story", "The strongest presentation begins well before photography or a launch date.", [
      ("See it with fresh eyes", "Walk through the property as a first-time visitor. Make a focused list of maintenance, clutter, lighting, landscaping, and small repairs that may distract from the experience of the home. Prioritize work that is appropriate for your goals and budget."),
      ("Organize the details", "Gather the material a serious buyer may need to understand the home: available property records, service information, improvement notes, and other relevant documents. Your qualified local professionals can advise on what is appropriate to share and when."),
      ("Position with context", "A good positioning conversation considers the property’s character, setting, condition, and the competing choices a buyer may see. It is not a promise about price or timing; it is a disciplined way to present the home to the right audience.")],
      ("Before photography", ["Resolve visible maintenance items where practical.", "Edit rooms so their scale and purpose are easy to read.", "Prepare a concise list of meaningful features and improvements.", "Confirm showing access, pet plans, and privacy preferences."])),
    ("Launch, show, evaluate, plan", "A sale benefits from an organized process and clear communication.", [
      ("Present the property well", "Editorial-quality photography, video, staging, and accurate property information can help a home make a composed first impression. Review the final listing materials carefully so they reflect the property honestly and clearly."),
      ("Make showings workable", "Set a showing plan that respects your routine and the home. Keep essential details available, clarify access expectations, and decide in advance how you would like feedback and updates shared."),
      ("Evaluate offers deliberately", "An offer is more than a headline number. Work with your advisor and qualified professionals to understand its terms, conditions, timing, and responsibilities. Take the time needed to compare the whole proposal and ask questions before you respond."),
      ("Plan for the handoff", "As a sale progresses, maintain an organized record, stay aligned with the professionals advising you, and plan the practical details of your move or transition. Legal, tax, and notarial matters should be handled with qualified local guidance.")],
      ("A clear seller rhythm", ["Agree on launch materials and feedback cadence.", "Keep a decision file for documents, questions, and offers.", "Review terms in full with appropriate professionals.", "Plan your transition without assuming a particular timeline."]))]),
"sma-moving-guide.pdf": ("Moving to San Miguel", "A grounded guide to exploring the city, planning a home search, and arriving with room to settle in.", [
    ("Explore before you organize everything", "Relocating is a series of practical choices and a chance to learn how you want to live.", [
      ("Get to know the rhythms", "Use an exploratory visit to move through neighborhoods at different times of day. Notice walkability, street activity, services, hills, outdoor space, and how each area feels in the routines you imagine having."),
      ("Plan a focused home search", "Write a brief for your advisor: target use of the home, timing, location preferences, accessibility needs, visitors, pets, workspace, and any features you do not want to compromise on. A clear brief helps tours stay useful."),
      ("Leave room for discovery", "A neighborhood that looks right online can feel different in person. Give yourself enough space to compare settings, revisit favorites, and decide what you need to learn before you make a commitment.")],
      ("A relocation visit checklist", ["Walk a few candidate areas at morning, afternoon, and evening.", "Test the routes and errands that matter to your routine.", "Keep short notes after every tour and neighborhood walk.", "Identify the local professionals you may need to consult."])),
    ("Prepare, arrive, settle", "Thoughtful preparation lets the first weeks feel more manageable.", [
      ("Make a practical plan", "Decide what you will bring, store, or replace; how you will handle documents; and what needs to be in place for your first days. Confirm requirements directly with the relevant providers or qualified professionals instead of relying on general checklists."),
      ("Treat specialist topics as specialist topics", "Residency, immigration, healthcare, banking, tax, legal, notarial, insurance, and financing questions are personal and can change. This guide is not advice on those subjects. Consult qualified local professionals and the relevant institutions for current guidance tailored to you."),
      ("Start small after arrival", "Give yourself time to establish daily routines: the routes you use, the services you prefer, and the people you will rely on. A first-week list can be simple - home essentials, local contacts, and a few places that make the city feel familiar.")],
      ("First weeks, at your pace", ["Keep key documents and professional contacts organized.", "Confirm any local arrangements directly with their providers.", "Learn your immediate neighborhood on foot.", "Schedule a private conversation when you are ready to refine your home search."]))])
}

def build(filename, title, subtitle, sections):
    s = make_styles(); path = OUT / filename
    doc = BaseDocTemplate(str(path), pagesize=letter, leftMargin=.72*inch, rightMargin=.72*inch, topMargin=.68*inch, bottomMargin=.72*inch, title=title, author="Blaze Beasley", subject="San Miguel de Allende real estate guide")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="all", frames=[frame])])
    story = [cover(title, subtitle, s), PageBreak()]
    for i, (section_title, intro, blocks, callout_data) in enumerate(sections):
        callout_title, items = callout_data
        story += header(f"0{i+1}  /  {section_title}", s) + [p(section_title, s["h1"]), p(intro, s["body"]), Spacer(1, 6)]
        for h, body in blocks:
            story += [p(h, s["h2"]), p(body, s["body"])]
        story += [Spacer(1, 8), callout(callout_title, "<br/>".join(["<b>" + x + "</b>" for x in items]), s), PageBreak()]
    story += [cta("A private conversation, at your pace.", "Blaze Beasley offers personal guidance for buyers and sellers exploring San Miguel de Allende. Begin with the questions that matter to you; there is no pressure to have every answer yet.", s)]
    doc.build(story, canvasmaker=lambda *a, **kw: GuideCanvas(*a, title=title, **kw))

if __name__ == "__main__":
    for filename, (title, subtitle, sections) in GUIDES.items(): build(filename, title, subtitle, sections)
    print("Built 3 guides in", OUT)
