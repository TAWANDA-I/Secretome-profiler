# SecretomeProfiler Validation Protein Lists
# Ready to paste directly into the application

---

## VALIDATION CASE 1: Bone Marrow MSC Secretome

**Citation:**
Kehl D et al. "Proteomic analysis of human mesenchymal stromal cell secretomes reveals novel immunomodulatory proteins." Stem Cells Translational Medicine. 2019. PMID: 31313507

Supporting: Timmers L et al. "Reduction of myocardial infarct size by human mesenchymal stem cell conditioned medium." Stem Cell Research. 2008. PMID: 19383393

**Scientific rationale:**
MSC secretome is the most extensively validated cell therapy secretome in published literature. Therapeutic effects of MSC conditioned medium are well-established in immunomodulation, tissue repair, and anti-inflammatory contexts across hundreds of peer-reviewed studies. This is the strongest possible positive control — if SecretomeProfiler does not correctly identify immunomodulation and tissue repair as top indications for this secretome, the scoring algorithm has a fundamental problem.

**Protein list (paste directly into app):**
```
TGFB1
TGFB2
TGFB3
VEGFA
HGF
FGF2
IGF1
IGF2
PDGFB
PDGFC
ANGPT1
ANGPT2
IL10
IL1RN
IL6
CCL2
CCL7
CXCL12
CXCL1
CXCL5
TNFAIP6
GDF11
GDF15
BMP4
BMP6
NRG1
FGF7
FGF10
WNT5A
DKK1
DKK3
SFRP1
SFRP2
FN1
COL1A1
COL1A2
COL3A1
COL6A1
COL6A2
COL6A3
MMP2
MMP9
MMP14
TIMP1
TIMP2
TIMP3
SPARC
CTGF
POSTN
TNC
THBS1
THBS2
VTN
FBN1
LAMA1
LAMB1
LAMC1
HSPG2
DCN
BGN
LUM
PLAU
PLAUR
SERPINE1
SERPINF1
HSP90AA1
HSPA8
HSPA5
HSPB1
CD44
CD63
CD9
CD81
A2M
APOE
CLU
LGALS1
LGALS3
ANXA1
ANXA2
ANXA5
S100A4
S100A6
EZR
MSN
VIM
ACTB
FLT1
MET
EGFR
```

**Expected biological profile:**
- Top therapeutic indication: Immunomodulation (score > 60)
- Second indication: Wound healing / Tissue repair (score > 55)
- Third indication: Anti-fibrotic (score > 45)
- Fourth indication: Angiogenesis (score > 40)
- SASP fraction: < 5%
- Safety level: Low
- Reference library top match: Bone Marrow MSC reference (Jaccard > 0.25)
- Key hub proteins in STRING: FN1, TGFB1, VEGFA, MMP2, HSP90AA1
- BBB-crossing proteins: IGF1, VEGFA (limited), CXCL12
- Top enriched pathways: ECM organization, cytokine-mediated signaling, immune response regulation

---

## VALIDATION CASE 2: Neural Stem Cell Secretome

**Citation:**
Sart S et al. "Multiscale analysis of neural stem cell secretome reveals neuroprotective and anti-inflammatory activities." Stem Cells and Development. 2021. PMID: 33469939

Supporting: Drago D et al. "The stem cell secretome and its role in brain repair." Biochimie. 2013. PMID: 23567335

**Scientific rationale:**
Neural stem cell secretome is the most relevant positive control for neuroregeneration scoring. The neurotrophic factor content (BDNF, NGF, GDNF, CNTF) is well-established and the BBB-crossing properties of these specific proteins are documented. This case validates both the therapeutic scoring and the pharmacokinetic module simultaneously.

**Protein list (paste directly into app):**
```
BDNF
NGF
NTF3
NTF4
GDNF
CNTF
LIF
CLCF1
VEGFA
IGF1
IGF2
HGF
FGF2
FGF4
FGF8
FGF10
PDGFA
PDGFB
ANGPT1
TGFB1
TGFB2
IL10
IL1RN
CXCL12
SEMA3A
SEMA3C
SEMA3F
SLIT2
EFNB1
EPHB2
WNT3A
WNT5A
WNT7A
NOTCH1
DLL1
JAG1
LAMA1
LAMB1
LAMC1
COL4A1
NIDOGEN1
NIDOGEN2
HSPG2
TNC
FN1
VTN
SPARC
MMP2
MMP9
TIMP1
TIMP2
CD9
CD63
CD81
TSG101
PDCD6IP
HSP90AA1
HSPA8
ANXA1
ANXA2
LGALS1
LGALS3
APOE
CLU
VIM
ACTB
NCAM1
L1CAM
NRXN1
NLGN1
NRCAM
APP
```

**Expected biological profile:**
- Top therapeutic indication: Neuroregeneration (score > 70)
- Second indication: Anti-inflammatory (score > 40)
- Third indication: Angiogenesis (score > 35)
- SASP fraction: < 3%
- Safety level: Low
- Reference library top match: Neural Stem Cell reference (Jaccard > 0.20)
- BBB-crossing proteins: BDNF (TrkB), NGF (TrkA), IGF1 (IGF1R), VEGFA (limited), CXCL12
- Key hub proteins: BDNF, FN1, VEGFA, IGF1, TGFB1

---

## VALIDATION CASE 3: Cardiac Progenitor Cell Secretome (Hypoxia-conditioned)

**Citation:**
Barile L et al. "Extracellular vesicles from human cardiac progenitor cells inhibit cardiomyocyte apoptosis and improve cardiac function after myocardial infarction." European Heart Journal. 2014. PMID: 24970339

Supporting: Cambier L et al. "Y RNA fragment in extracellular vesicles confers cardioprotection via modulation of IL-10 expression and secretion." EMBO Molecular Medicine. 2017. PMID: 28507163

**Scientific rationale:**
Cardiac progenitor cell secretome under hypoxia represents a clinically relevant manufacturing condition. Hypoxia upregulates pro-survival and angiogenic factors (HIF-1α targets). This tests whether the tool correctly identifies cardioprotection and angiogenesis for a well-studied cardiac cell type. It also serves as a distinct positive control from the MSC case, with a more focused indication profile.

**Protein list (paste directly into app):**
```
NRG1
NRG4
VEGFA
VEGFB
VEGFC
HGF
IGF1
IGF2
FGF2
FGF16
FGF21
ANGPT1
ANGPT2
KITLG
GDF11
GDF15
GDF2
BMP10
IL10
IL11
IL1RN
TGFB1
CXCL12
CXCL1
FN1
COL1A1
COL3A1
THBS1
THBS2
MMP2
MMP9
MMP14
TIMP1
TIMP2
SPARC
POSTN
CTGF
CD9
CD63
CD81
TSG101
PDCD6IP
FLOT1
FLOT2
PLAU
PLAUR
SERPINE1
HSP90AA1
HSPA8
HSPA5
ANXA1
ANXA2
LGALS1
VIM
ACTB
EGFR
MET
FLT1
KDR
PDGFRB
ERBB2
ERBB4
```

**Expected biological profile:**
- Top therapeutic indication: Cardioprotection (score > 60)
- Second indication: Angiogenesis (score > 55)
- Third indication: Wound healing (score > 40)
- SASP fraction: < 5%
- Safety level: Low
- Reference library top match: Cardiac Progenitor reference (Jaccard > 0.20)

---

## VALIDATION CASE 4A: M2 Macrophage Secretome (Anti-inflammatory)

**Citation:**
Mantovani A et al. "Macrophage polarization comes of age." Immunity. 2005. PMID: 16286016

Supporting proteomics: Vogel DYS et al. "Human macrophage polarization in vitro: maturation and activation methods compared." Immunobiology. 2014. PMID: 24484938

**Scientific rationale:**
M2 macrophages are a canonical anti-inflammatory cell type. Running both M1 and M2 and showing the tool scores them differently is compelling validation evidence for scoring specificity. Reviewers of a bioinformatics paper will specifically ask about specificity controls — this addresses that directly.

**M2 Protein list (paste directly into app):**
```
IL10
IL1RN
IL4
IL13
TGFB1
TGFB2
TGFB3
CCL17
CCL18
CCL22
CCL13
CXCL13
IGF1
IGF2
FGF2
HGF
VEGFA
PDGFB
MRC1
CD163
CLEC7A
CLEC4E
CD200R1
IDO1
ARG1
ARG2
LGALS1
LGALS3
LGALS9
MMP7
MMP9
MMP12
TIMP1
TIMP3
FN1
COL1A1
COL3A1
SPARC
TGM2
CHI3L1
CHI3L2
CD44
CD81
ANXA1
ANXA2
S100A4
THBS1
CTGF
POSTN
SFRP1
SFRP2
CXCL12
IL18BP
CD274
PDCD1LG2
```

**Expected biological profile:**
- Top therapeutic indication: Anti-inflammatory / Immunomodulation (score > 65)
- SASP fraction: < 5%
- Safety level: Low

---

## VALIDATION CASE 4B: M1 Macrophage Secretome (Pro-inflammatory — specificity control)

**Citation:** Same as Case 4A (paired experiment from same publications)

**Scientific rationale:**
M1 must score significantly LOWER than M2 for anti-inflammatory indication. This is the specificity validation. If M1 and M2 score similarly, the tool cannot distinguish therapeutic from pro-inflammatory secretomes.

**M1 Protein list (paste directly into app):**
```
IL1B
IL6
TNF
IL12A
IL12B
IL23A
CXCL8
CCL2
CCL3
CCL4
CCL5
CXCL9
CXCL10
CXCL11
NOS2
MMP1
MMP3
MMP8
MMP13
SERPINE1
S100A8
S100A9
S100A12
HMGB1
HSPA1A
PTGS2
IL15
IL18
IL27
IFNG
TNFSF10
TNFSF14
CD80
CD86
FAS
FASLG
RIPK3
CASP1
CASP4
CASP5
IL1A
IL33
IL36A
CXCL2
CXCL3
MIF
MCPT1
ELANE
MPO
LCN2
```

**Expected biological profile:**
- Anti-inflammatory score: significantly LOWER than M2 (difference > 15 points)
- SASP fraction: > 10% (IL6, TNF, IL1B, S100A8/9 present)
- Safety level: Moderate (cytokine storm risk flagged)

**Key validation point:** M2 anti-inflammatory score MINUS M1 anti-inflammatory score must be > 15 points. Record both scores.

---

## VALIDATION CASE 5: Platelet-Rich Plasma (PRP) Releasate

**Citation:**
Boswell SG et al. "Platelet-rich plasma: A milieu of bioactive factors." Arthroscopy. 2012. PMID: 22014323

Supporting: Everts PAM et al. "Platelet-rich plasma and platelet gel: a review." Journal of Extra-Corporeal Technology. 2006. PMID: 16921694

**Scientific rationale:**
PRP is one of the most widely used secretome-based therapies in clinical practice (orthopedics, wound care, dermatology). The wound healing and tissue repair effects are supported by level 1-2 clinical evidence. If the tool does not correctly identify wound healing as the top indication for PRP, the scoring has a fundamental validity problem. This is the strongest clinical validation case available because the therapeutic use is already approved and routine.

**Protein list (paste directly into app):**
```
PDGFA
PDGFB
PDGFC
PDGFD
TGFB1
TGFB2
TGFB3
EGF
VEGFA
VEGFB
FGF2
FGF7
IGF1
HGF
ANGPT1
PF4
PPBP
CXCL7
VWF
SELP
GP1BA
GP9
THBS1
THBS2
FGB
FGA
FGG
SERPINE1
PLAT
PLAU
PLAUR
FN1
VTN
COL1A1
COL3A1
MMP1
MMP2
MMP9
TIMP1
TIMP2
SPARC
CCL5
CCL3
CCL4
CXCL1
CXCL4
CXCL5
ITGA2B
ITGB3
CD62P
GP6
F13A1
PROS1
PROC
TFPI
THBD
ANXA1
ANXA5
S100A4
CD9
CD63
CD41
CD42A
FGF10
BMP2
BMP7
```

**Expected biological profile:**
- Top therapeutic indication: Wound healing (score > 65)
- Second indication: Tissue repair / Angiogenesis (score > 50)
- Third indication: Bone/cartilage regeneration (score > 40) — driven by PDGF and TGFb
- SASP fraction: < 5%
- Safety level: Low — but coagulation safety flag expected (VWF, FGB, SERPINE1)
- Reference library top match: Platelet releasate reference (Jaccard > 0.20)

---

## VALIDATION CASE 6: Young Plasma Proteome (Pro-youthful enriched fraction)

**Citation:**
Sinha M et al. "Restoring systemic GDF11 levels reverses age-related dysfunction in mouse skeletal muscle." Science. 2014. PMID: 24797481

Supporting proteomics: Lehallier B et al. "Undulating changes in human plasma proteome profiles across the lifespan." Nature Medicine. 2019. PMID: 31806903

**Scientific rationale:**
Young plasma as a rejuvenation therapeutic is one of the most actively investigated areas in aging biology. GDF11, IGF1, and FGF21 are established pro-youthful factors. This case tests the anti-senescence scoring module specifically and validates that the tool can identify the rejuvenation therapeutic context. It is the most novel indication category in the tool.

**Protein list (paste directly into app):**
```
GDF11
GDF15
IGF1
FGF21
FGF23
MSTN
FSTL3
BDNF
VEGFA
APOE
CLU
CXCL12
TGFB1
IL10
IL1RN
THBS1
ANGPT1
PLAT
THBD
TFPI
ADIPOQ
ANGPTL3
ANGPTL4
PCSK9
LCAT
APOA1
APOA2
APOB
ALB
TF
TTR
RBP4
A2M
ORM1
ORM2
AHSG
HP
SERPINF1
IGFBP1
IGFBP2
IGFBP3
IGFBP4
IGFBP5
FN1
VTN
THBS2
COMP
SPARC
MMP2
TIMP1
LGALS3
ANXA1
HSP90AA1
CLU
PON1
PON3
APOC3
APOD
APOM
APOC1
VWF
```

**Expected biological profile:**
- Top therapeutic indication: Anti-senescence (score > 55)
- Second indication: Neuroregeneration (score > 40)
- Third indication: Cardioprotection (score > 35)
- GDF11 identified as key driver
- IGF1 flagged as BBB-crossing
- Safety level: Low
- Reference library: Young plasma–type match

---

## VALIDATION CASE 7: NEGATIVE CONTROL — Intracellular/Nuclear Protein Set

**Citation:** N/A — constructed negative control

**Scientific rationale:**
A negative control is scientifically essential and reviewers will expect it. This set contains proteins that are definitionally NOT secreted — nuclear transcription factors, ribosomal proteins, DNA repair enzymes, and cytoskeletal proteins. These proteins only appear extracellularly due to cell death (necrosis), not active secretion. If the tool produces high therapeutic indication scores for this set, the scoring algorithm has a false positive problem that must be corrected before publication.

**Protein list (paste directly into app):**
```
TP53
MYC
BRCA1
BRCA2
RB1
PTEN
APC
MLH1
MSH2
RAD51
XRCC1
ATM
CHEK2
CDK4
CCND1
PCNA
MCM2
MCM6
RFC1
POLE
HIST1H2AB
HIST1H2BB
HIST1H3A
HIST1H4A
RPS3
RPS6
RPL5
RPL11
RPS11
EIF4A1
EIF2A
HNRNPA1
HNRNPC
SRSF1
SF3B1
SNRNP70
U2AF1
ACTB
TUBB
TUBA1A
VIM
LMNA
LMNB1
NUP98
KPNB1
RANGAP1
TOP2A
TOP1
DNMT1
HDAC1
HDAC2
EZH2
SUZ12
CTCF
YBX1
NCOR1
SMAD4
```

**Expected biological profile:**
- ALL therapeutic indication scores: < 20
- Classical secretory pathway (SignalP): < 5% of proteins
- SASP fraction: < 2%
- Safety level: Low (proteins not present as secreted factors)
- Reference library: No close match (Jaccard < 0.05 for all references)

**Failure threshold:** If ANY indication scores > 25, flag as scoring algorithm false positive requiring investigation before publication.
