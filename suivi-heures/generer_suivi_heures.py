"""Génère le classeur de suivi des heures (1er déc. 2027 au 1er déc. 2028).

Usage : python3 generer_suivi_heures.py [fichier_sortie.xlsx]
Le fichier .xlsx peut ensuite être importé dans Google Drive (conversion en Google Sheets).
"""
import sys
from datetime import date, timedelta

from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, Reference
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

DEBUT = date(2027, 12, 1)
FIN = date(2028, 12, 1)

MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet",
        "Août", "Septembre", "Octobre", "Novembre", "Décembre"]

MOIS_COURT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août",
              "sept.", "oct.", "nov.", "déc."]

FONT = "Arial"
BLEU = "1F4E78"
BLEU_CLAIR = "DDEBF7"
JAUNE = "FFF2CC"
GRIS = "F2F2F2"

f_titre = Font(name=FONT, size=16, bold=True, color=BLEU)
f_entete = Font(name=FONT, size=10, bold=True, color="FFFFFF")
f_normal = Font(name=FONT, size=10)
f_gras = Font(name=FONT, size=10, bold=True)
f_saisie = Font(name=FONT, size=10, color="0000FF")
f_note = Font(name=FONT, size=9, italic=True, color="595959")
fill_entete = PatternFill("solid", fgColor=BLEU)
fill_saisie = PatternFill("solid", fgColor=JAUNE)
fill_total = PatternFill("solid", fgColor=BLEU_CLAIR)
fill_gris = PatternFill("solid", fgColor=GRIS)
fin_trait = Side(style="thin", color="BFBFBF")
bordure = Border(left=fin_trait, right=fin_trait, top=fin_trait, bottom=fin_trait)
centre = Alignment(horizontal="center", vertical="center")
gauche = Alignment(horizontal="left", vertical="center")

FMT_DATE = "dd/mm/yyyy"
FMT_HEURE = "hh:mm"
FMT_DUREE = "[h]:mm"
FMT_DEC = "0.00"

PREMIERE_LIGNE = 6  # première ligne de données sur les feuilles mensuelles


def nom_feuille(annee, mois):
    return f"{MOIS[mois - 1]} {annee}"


def ref(feuille):
    return "'" + feuille.replace("'", "''") + "'"


def entete(ws, ligne, titres):
    for col, titre in enumerate(titres, start=1):
        c = ws.cell(row=ligne, column=col, value=titre)
        c.font = f_entete
        c.fill = fill_entete
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = bordure
    ws.row_dimensions[ligne].height = 30


def mois_de_la_periode():
    a, m = DEBUT.year, DEBUT.month
    while (a, m) <= (FIN.year, FIN.month):
        yield a, m
        a, m = (a + 1, 1) if m == 12 else (a, m + 1)


def jours_du_mois(a, m):
    j = date(a, m, 1)
    while j.month == m and j <= FIN:
        if j >= DEBUT:
            yield j
        j += timedelta(days=1)


wb = Workbook()

# ---------------------------------------------------------------- Mode d'emploi
guide = wb.active
guide.title = "Mode d'emploi"
guide["A1"] = "Suivi des heures de travail"
guide["A1"].font = f_titre
lignes = [
    "Période suivie : du 1er décembre 2027 au 1er décembre 2028, une feuille par mois.",
    "",
    "Saisie, dans la feuille du mois :",
    "1. Heure de début, au format 08:30.",
    "2. Heure de fin, au format 17:15. Une fin après minuit (ex. 22:00 à 02:00) est gérée.",
    "3. Durée de la pause repas, au format 00:45 pour 45 minutes. Laisser vide s'il n'y a pas de pause.",
    "Remplir uniquement les cases jaunes (texte bleu). Les autres colonnes se calculent seules.",
    "Un jour non travaillé reste simplement vide.",
    "",
    "Le Tableau de bord regroupe les totaux par semaine, par mois et par année, avec les graphiques.",
    "Les heures prévues au contrat par semaine se règlent dans le Tableau de bord (case jaune).",
]
for i, texte in enumerate(lignes, start=3):
    guide.cell(row=i, column=1, value=texte).font = f_normal

guide["A16"] = "Exemple de ligne remplie"
guide["A16"].font = f_gras
entete(guide, 17, ["Date", "Jour", "Début", "Fin", "Pause repas",
                   "Heures travaillées", "Heures (décimal)"])
ex = {"A18": (date(2027, 12, 1), FMT_DATE), "B18": ("mercredi", None),
      "C18": ("=TIME(8,30,0)", FMT_HEURE), "D18": ("=TIME(17,15,0)", FMT_HEURE),
      "E18": ("=TIME(0,45,0)", FMT_DUREE), "F18": ("=MOD(D18-C18,1)-E18", FMT_DUREE),
      "G18": ("=F18*24", FMT_DEC)}
for adr, (val, fmt) in ex.items():
    c = guide[adr]
    c.value = val
    c.font = f_saisie if adr[0] in "CDE" else f_normal
    if adr[0] in "CDE":
        c.fill = fill_saisie
    if fmt:
        c.number_format = fmt
    c.alignment = centre
    c.border = bordure
guide["A19"] = "8h30 à 17h15 avec 45 min de pause = 8:00, soit 8,00 heures."
guide["A19"].font = f_note
guide.column_dimensions["A"].width = 14
for col in "BCDEFG":
    guide.column_dimensions[col].width = 16

# ---------------------------------------------------------------- Feuilles mensuelles
infos_mois = []  # (feuille, annee, mois, premiere, derniere)
for a, m in mois_de_la_periode():
    nom = nom_feuille(a, m)
    ws = wb.create_sheet(nom)
    jours = list(jours_du_mois(a, m))
    l1 = PREMIERE_LIGNE
    lN = l1 + len(jours) - 1
    infos_mois.append((nom, a, m, l1, lN))

    ws["A1"] = nom
    ws["A1"].font = f_titre

    resume = [("Total du mois", f"=SUM(F{l1}:F{lN})", FMT_DUREE),
              ("Total (décimal)", f"=SUM(G{l1}:G{lN})", FMT_DEC),
              ("Jours travaillés", f"=COUNT(F{l1}:F{lN})", "0")]
    for i, (lib, formule, fmt) in enumerate(resume):
        col = 1 + i * 2
        lc = ws.cell(row=3, column=col, value=lib)
        lc.font = f_gras
        lc.alignment = gauche
        vc = ws.cell(row=3, column=col + 1, value=formule)
        vc.font = f_gras
        vc.fill = fill_total
        vc.number_format = fmt
        vc.alignment = centre
        vc.border = bordure

    entete(ws, 5, ["Date", "Jour", "Début", "Fin", "Pause repas",
                   "Heures travaillées", "Heures (décimal)", "Semaine", "Commentaire"])

    for i, j in enumerate(jours):
        r = l1 + i
        valeurs = [
            (j, FMT_DATE),
            (f'=CHOOSE(WEEKDAY(A{r},2),"lundi","mardi","mercredi","jeudi",'
             f'"vendredi","samedi","dimanche")', None),
            (None, FMT_HEURE),
            (None, FMT_HEURE),
            (None, FMT_DUREE),
            (f'=IF(OR(C{r}="",D{r}=""),"",MOD(D{r}-C{r},1)-E{r})', FMT_DUREE),
            (f'=IF(F{r}="","",F{r}*24)', FMT_DEC),
            (f'="S"&_xlfn.ISOWEEKNUM(A{r})', None),
            (None, None),
        ]
        for col, (val, fmt) in enumerate(valeurs, start=1):
            c = ws.cell(row=r, column=col, value=val)
            c.border = bordure
            c.alignment = gauche if col == 9 else centre
            if fmt:
                c.number_format = fmt
            if col in (3, 4, 5):
                c.font = f_saisie
                c.fill = fill_saisie
            else:
                c.font = f_normal

    # Week-ends en gris (texte des colonnes calculées)
    ws.conditional_formatting.add(
        f"A{l1}:B{lN}",
        FormulaRule(formula=[f"WEEKDAY($A{l1},2)>5"], fill=fill_gris,
                    font=Font(name=FONT, color="808080")))
    # Pause plus longue que la journée : signalée en rouge
    ws.conditional_formatting.add(
        f"F{l1}:G{lN}",
        FormulaRule(formula=[f'AND(F{l1}<>"",F{l1}<0)'],
                    font=Font(name=FONT, bold=True, color="C00000")))

    largeurs = {"A": 14, "B": 12, "C": 10, "D": 10, "E": 13, "F": 15, "G": 15,
                "H": 10, "I": 36}
    for col, w in largeurs.items():
        ws.column_dimensions[col].width = w
    ws.freeze_panes = f"A{l1}"

# ---------------------------------------------------------------- Tableau de bord
tb = wb.create_sheet("Tableau de bord", 1)
tb["A1"] = "Tableau de bord des heures"
tb["A1"].font = f_titre

tb["A3"] = "Heures prévues au contrat par semaine"
tb["A3"].font = f_gras
tb["D3"] = 35
tb["D3"].font = f_saisie
tb["D3"].fill = fill_saisie
tb["D3"].number_format = FMT_DEC
tb["D3"].alignment = centre
tb["D3"].border = bordure
tb["E3"] = "Valeur à adapter (35 h par défaut)."
tb["E3"].font = f_note

# --- Tableau mensuel
L_MOIS = 10
nb_mois = len(infos_mois)
L_MOIS_FIN = L_MOIS + nb_mois - 1
entete(tb, L_MOIS - 1, ["Mois", "Année", "Heures (décimal)", "Heures (h:mm)",
                        "Jours travaillés", "Moyenne par jour"])
for i, (nom, a, m, l1, lN) in enumerate(infos_mois):
    r = L_MOIS + i
    s = ref(nom)
    valeurs = [
        (f"{MOIS_COURT[m - 1]} {a}", None),
        (f"=YEAR({s}!A{l1})", "0"),
        (f"={s}!D3", FMT_DEC),
        (f"={s}!B3", FMT_DUREE),
        (f"={s}!F3", "0"),
        (f"=IF(E{r}=0,0,C{r}/E{r})", FMT_DEC),
    ]
    for col, (val, fmt) in enumerate(valeurs, start=1):
        c = tb.cell(row=r, column=col, value=val)
        c.font = Font(name=FONT, size=10, color="008000") if col in (3, 4, 5) else f_normal
        c.alignment = centre
        c.border = bordure
        if fmt:
            c.number_format = fmt

# --- Synthèse (au-dessus, ligne 5-7)
synth = [
    ("Total sur la période", f"=SUM(C{L_MOIS}:C{L_MOIS_FIN})", FMT_DEC),
    ("Total 2027", f"=SUMIFS(C{L_MOIS}:C{L_MOIS_FIN},B{L_MOIS}:B{L_MOIS_FIN},2027)", FMT_DEC),
    ("Total 2028", f"=SUMIFS(C{L_MOIS}:C{L_MOIS_FIN},B{L_MOIS}:B{L_MOIS_FIN},2028)", FMT_DEC),
    ("Jours travaillés", f"=SUM(E{L_MOIS}:E{L_MOIS_FIN})", "0"),
]
entete_s = 5
for i, (lib, formule, fmt) in enumerate(synth):
    col = 1 + i * 2
    c = tb.cell(row=entete_s, column=col, value=lib)
    c.font = f_gras
    c.alignment = Alignment(wrap_text=True, vertical="center")
    v = tb.cell(row=entete_s + 1, column=col, value=formule)
    v.font = Font(name=FONT, size=14, bold=True, color=BLEU)
    v.fill = fill_total
    v.number_format = fmt
    v.alignment = centre
    v.border = bordure
tb.row_dimensions[entete_s].height = 28
tb.row_dimensions[entete_s + 1].height = 26
tb.cell(row=7, column=1, value="Totaux en heures décimales : 7,50 = 7h30.").font = f_note

# --- Tableau hebdomadaire
L_SEM_ENT = L_MOIS_FIN + 3
L_SEM = L_SEM_ENT + 1
tb.cell(row=L_SEM_ENT - 1, column=1, value="Heures par semaine").font = f_gras
entete(tb, L_SEM_ENT, ["Semaine", "Du (lundi)", "Au (dimanche)", "Heures (décimal)",
                       "Heures (h:mm)", "Écart au contrat", "Contrat"])

lundi = DEBUT - timedelta(days=DEBUT.weekday())
r = L_SEM
while lundi <= FIN:
    dimanche = lundi + timedelta(days=6)
    morceaux = []
    for nom, a, m, l1, lN in infos_mois:
        premier = date(a, m, 1)
        dernier = min(FIN, (date(a + (m == 12), m % 12 + 1, 1) - timedelta(days=1)))
        if premier <= dimanche and dernier >= lundi:
            s = ref(nom)
            morceaux.append(
                f'SUMIFS({s}!$G${l1}:$G${lN},{s}!$A${l1}:$A${lN},">="&$B{r},'
                f'{s}!$A${l1}:$A${lN},"<="&$C{r})')
    valeurs = [
        (f'="S"&_xlfn.ISOWEEKNUM(B{r})&"-"&RIGHT(YEAR(B{r}+3),2)', None),
        (lundi, FMT_DATE),
        (f"=B{r}+6", FMT_DATE),
        ("=" + "+".join(morceaux), FMT_DEC),
        (f"=D{r}/24", FMT_DUREE),
        (f'=IF(D{r}=0,"",D{r}-G{r})', '+0.00;-0.00;0.00'),
        ("=$D$3", FMT_DEC),
    ]
    for col, (val, fmt) in enumerate(valeurs, start=1):
        c = tb.cell(row=r, column=col, value=val)
        c.font = f_normal
        c.alignment = centre
        c.border = bordure
        if fmt:
            c.number_format = fmt
    r += 1
    lundi += timedelta(days=7)
L_SEM_FIN = r - 1

# Écart positif en vert, négatif en rouge
tb.conditional_formatting.add(
    f"F{L_SEM}:F{L_SEM_FIN}",
    FormulaRule(formula=[f"AND(D{L_SEM}>0,F{L_SEM}>0)"], font=Font(name=FONT, color="008000", bold=True)))
tb.conditional_formatting.add(
    f"F{L_SEM}:F{L_SEM_FIN}",
    FormulaRule(formula=[f"AND(D{L_SEM}>0,F{L_SEM}<0)"], font=Font(name=FONT, color="C00000", bold=True)))

r = L_SEM_FIN + 1
tb.cell(row=r, column=1, value="Moyenne").font = f_gras
moy = tb.cell(row=r, column=4,
              value=f'=IF(COUNTIF(D{L_SEM}:D{L_SEM_FIN},">0")=0,0,'
                    f'SUMIF(D{L_SEM}:D{L_SEM_FIN},">0")/COUNTIF(D{L_SEM}:D{L_SEM_FIN},">0"))')
moy.font = f_gras
moy.fill = fill_total
moy.number_format = FMT_DEC
moy.alignment = centre
moy.border = bordure
tb.cell(row=r, column=5, value="Moyenne des semaines travaillées.").font = f_note

for col, w in {"A": 16, "B": 13, "C": 16, "D": 16, "E": 16, "F": 16, "G": 18}.items():
    tb.column_dimensions[col].width = w
tb.column_dimensions["H"].width = 3

# --- Graphiques
g_mois = BarChart()
g_mois.type = "col"
g_mois.title = "Heures par mois"
g_mois.y_axis.title = "Heures"
g_mois.add_data(Reference(tb, min_col=3, min_row=L_MOIS - 1, max_row=L_MOIS_FIN), titles_from_data=True)
g_mois.set_categories(Reference(tb, min_col=1, min_row=L_MOIS, max_row=L_MOIS_FIN))
g_mois.legend = None
g_mois.height, g_mois.width = 8, 18
tb.add_chart(g_mois, "I3")

g_sem = BarChart()
g_sem.type = "col"
g_sem.title = "Heures par semaine"
g_sem.y_axis.title = "Heures"
g_sem.add_data(Reference(tb, min_col=4, min_row=L_SEM_ENT, max_row=L_SEM_FIN), titles_from_data=True)
g_sem.set_categories(Reference(tb, min_col=1, min_row=L_SEM, max_row=L_SEM_FIN))
ligne_contrat = LineChart()
ligne_contrat.add_data(Reference(tb, min_col=7, min_row=L_SEM_ENT, max_row=L_SEM_FIN), titles_from_data=True)
g_sem += ligne_contrat
g_sem.height, g_sem.width = 9, 30
tb.add_chart(g_sem, "I21")

tb.freeze_panes = "A4"
wb.active = 1

sortie = sys.argv[1] if len(sys.argv) > 1 else "Suivi_des_heures_2027-2028.xlsx"
wb.save(sortie)
print("Enregistré :", sortie, "| semaines :", L_SEM, "à", L_SEM_FIN)
