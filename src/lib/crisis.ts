// Crisis-detection middleware shared between server logic and UI rendering.

export type CrisisResource = {
  name: string;
  contact: string;
  detail: string;
};

/**
 * Real severity gradient (Phase 11). Ordered most → least urgent.
 * - critical: explicit method, plan, means, or timeframe
 * - high: clear suicidal / self-harm / harm-to-others ideation, no stated plan
 * - moderate: passive ideation or ambivalent / ambiguous language
 */
export type CrisisSeverity = "critical" | "high" | "moderate";

export const CRISIS_SEVERITY_ORDER: CrisisSeverity[] = ["critical", "high", "moderate"];

export function severityRank(severity: string): number {
  const index = CRISIS_SEVERITY_ORDER.indexOf(severity as CrisisSeverity);
  return index === -1 ? CRISIS_SEVERITY_ORDER.length : index;
}

export type CrisisResponse = {
  type: "crisis";
  severity: CrisisSeverity;
  message: string;
  matched: string[];
  resources: CrisisResource[];
  disclaimer: string;
};

// Tiered pattern list. The tier of the *highest* matching pattern decides the
// severity written to crisis_events; the flat matched-term list is preserved
// for the admin queue.
const CRITICAL_PATTERNS: RegExp[] = [
  /\b(pills|rope|gun|knife|blade|razor|bleach|overdos(e|ing))\b[^.]{0,40}\b(ready|bought|have|got|saved|hidden|loaded)\b/i,
  /\b(ready|bought|have|got|saved|hidden|loaded)\b[^.]{0,40}\b(pills|rope|gun|knife|blade|razor|bleach)\b/i,
  /\b(tonight|today|tomorrow|this\s+(weekend|week|evening)|in\s+an?\s+hour)\b[^.]{0,40}\b(kill|end|die|suicide|overdose|hang|jump)\b/i,
  /\b(kill|end|die|suicide|overdose|hang|jump)\w*\b[^.]{0,40}\b(tonight|today|tomorrow|this\s+(weekend|week|evening)|in\s+an?\s+hour)\b/i,
  /\bi\s+(have|wrote|left)\s+a\s+(note|letter|will)\b/i,
  /\bmy\s+plan\s+is\b/i,
  /\b(i'?m|im|about)\s+(going\s+to|gonna|about\s+to)\s+(kill\s+my ?self|end\s+it|end\s+my\s+life|overdose|hang\s+my ?self|jump)\b/i,
  /\bhang\s+my ?self\b/i,
  /\bloaded\s+(gun|weapon)\b/i,
];

const HIGH_RISK_PATTERNS: RegExp[] = [
  /\bkill(ing)?\s+my ?self\b/i,
  /\bkill\s+(him|her|them|someone|people)\b/i,
  /\bend(ing)?\s+(my|it)\s+(life|all)\b/i,
  /\bend\s+it\s+all\b/i,
  /\btake\s+my\s+own\s+life\b/i,
  /\bsuicid(e|al)\b/i,
  /\bwant\s+to\s+die\b/i,
  /\bdon'?t\s+want\s+to\s+(be\s+alive|live)\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  /\b(cut|cutting|hurt|hurting|harm|harming)\s+my ?self\b/i,
  /\bself[-\s]?harm\b/i,
  /\boverdos(e|ing)\b/i,
  /\bhurt\s+(someone|somebody|others|people|him|her|them)\b/i,
];

const MODERATE_PATTERNS: RegExp[] = [
  /\bbetter\s+off\s+dead\b/i,
  /\bbetter\s+off\s+without\s+me\b/i,
  /\bwish\s+i\s+(wasn'?t|was\s+not)\s+(here|alive|around|born)\b/i,
  /\bwish\s+i\s+(could\s+)?(just\s+|simply\s+)?(disappear|vanish|stop\s+existing|not\s+wake\s+up)\b/i,
  /\bdon'?t\s+want\s+to\s+(wake\s+up|be\s+here|exist)\b/i,
  /\bwhat'?s\s+the\s+point\s+of\s+(living|being\s+here|any\s+of\s+it)\b/i,
  /\btired\s+of\s+being\s+alive\b/i,
  /\bnobody\s+would\s+(notice|miss\s+me|care)\s+if\s+i\b/i,
];

// --- Arabic patterns (MSA + common Levantine/Gulf colloquial) ---
// NOTE: \b is unreliable for Arabic in JS (Arabic letters are not \w), so these
// patterns rely on the phrases themselves rather than word boundaries.
const CRITICAL_PATTERNS_AR: RegExp[] = [
  /(الليلة|اليوم|بكرا|غدا|غدًا|هالأسبوع|هذا الأسبوع)[^.؟!]{0,40}(أنهي|انهي|أموت|اموت|انتحر|أنتحر|أقتل نفسي|بقتل نفسي|بقتل حالي)/,
  /(أنهي|انهي|أموت|اموت|انتحر|أنتحر|أقتل نفسي|بقتل نفسي|بقتل حالي)[^.؟!]{0,40}(الليلة|اليوم|بكرا|غدا|غدًا)/,
  /(حبوب|مسدس|سلاح|حبل|شفرة|موس|سكين|مبيد|كلور)[^.؟!]{0,40}(جاهز|جاهزة|عندي|شتريت|اشتريت|خبيت|خبأت|حضرت)/,
  /(عندي|شتريت|اشتريت|خبيت|خبأت|حضرت|جاهز)[^.؟!]{0,40}(حبوب|مسدس|سلاح|حبل|شفرة|موس|سكين|مبيد|كلور)/,
  /(كتبت|تركت)[^.؟!]{0,20}(رسالة|وصية|ورقة)/,
  /خطتي\s+(هي|هي أن|إني|اني)/,
  /(رح|راح|بدي|سوف)\s*(أ|ا)?(شنق|علق)\s*(نفسي|حالي)/,
];

const HIGH_RISK_PATTERNS_AR: RegExp[] = [
  /(أقتل|اقتل|بقتل|رح أقتل|راح اقتل)\s*(نفسي|حالي)/,
  /(انتحار|الانتحار|أنتحر|انتحر|إنتحار)/,
  /(أنهي|انهي|إنهاء|انهاء)\s*(حياتي|كل شي|كل شيء)/,
  /(بدي|أريد|اريد|نفسي)\s*(أ|ا)?موت/,
  /(ما بدي|لا أريد|لا اريد|ما بقى بدي)\s*(أعيش|اعيش|أكمل|احيا|أحيا)/,
  /(ما في|مافي|ليس هناك|ما عندي)\s*(سبب|معنى)\s*(لأعيش|للحياة|للعيش)/,
  /(أذي|اذي|بأذي|أجرح|اجرح|بجرح)\s*(نفسي|حالي)/,
  /(إيذاء|ايذاء)\s*(النفس|نفسي|الذات)/,
  /(جرعة زائدة|أوفر دوز)/,
  /(أقتل|اقتل|بقتل|أذي|اذي)\s*(حد|واحد|شخص|أهلي|اهلي|الناس)/,
];

const MODERATE_PATTERNS_AR: RegExp[] = [
  /(أحسن|احسن|الأفضل|افضل)\s*(لو|إذا|اذا)\s*(مت|أموت|اموت|ما كنت)/,
  /(أحسن|احسن|الدنيا أحسن)\s*(بدوني|من دوني)/,
  /(ياريت|يا ريت|أتمنى|اتمنى)\s*(لو)?\s*(ما كنت|أختفي|اختفي|ما فيق|ما أفيق|ما أصحى)/,
  /(ما بدي|لا أريد|لا اريد)\s*(أفيق|افيق|أصحى|اصحى|أكون هنا|اكون هنا)/,
  /(شو|ما)\s*(الفايدة|الفائدة|المعنى)\s*(من)?\s*(الحياة|العيش|هالحياة)/,
  /(تعبت|زهقت|مليت)\s*(من)\s*(الحياة|العيش|كل شي|كل شيء)/,
  /(ما حد|محد|لا أحد)\s*(بيهتم|يهتم|رح يلاحظ|بيلاحظ)/,
];

// --- French patterns ---
const CRITICAL_PATTERNS_FR: RegExp[] = [
  /\b(ce\s+soir|aujourd'?hui|demain|cette\s+(nuit|semaine)|dans\s+une?\s+heure)\b[^.!?]{0,40}\b(mourir|me\s+tuer|en\s+finir|me\s+suicider|surdose|me\s+pendre|sauter)\b/i,
  /\b(mourir|me\s+tuer|en\s+finir|me\s+suicider|surdose|me\s+pendre|sauter)\b[^.!?]{0,40}\b(ce\s+soir|aujourd'?hui|demain|cette\s+(nuit|semaine)|dans\s+une?\s+heure)\b/i,
  /\b(j'?ai|j'?ai\s+déjà)\s+(acheté|préparé|caché|gardé|pris)\b[^.!?]{0,40}\b(cachets|comprimés|médicaments|corde|arme|lame|rasoir|javel)\b/i,
  /\b(cachets|comprimés|médicaments|corde|arme|lame|rasoir|javel)\b[^.!?]{0,40}\b(prêt|prête|acheté|caché|gardé)\b/i,
  /\bj'?ai\s+(écrit|laissé)\s+(une|un)\s+(lettre|mot|testament)\b/i,
  /\bmon\s+plan\s+(c'?est|est)\b/i,
  /\bje\s+vais\s+(me\s+tuer|me\s+suicider|en\s+finir|me\s+pendre|sauter)\b/i,
];

const HIGH_RISK_PATTERNS_FR: RegExp[] = [
  /\bme\s+(tuer|suicider)\b/i,
  /\bsuicid(e|aire|er)\b/i,
  /\ben\s+finir\s+(avec\s+(la\s+vie|tout|moi))?/i,
  /\bmettre\s+fin\s+à\s+(mes\s+jours|ma\s+vie)\b/i,
  /\bje\s+(veux|voudrais)\s+mourir\b/i,
  /\bje\s+ne\s+veux\s+plus\s+(vivre|être\s+en\s+vie)\b/i,
  /\b(plus|aucune)\s+(envie|raison)\s+de\s+vivre\b/i,
  /\bme\s+faire\s+du\s+mal\b/i,
  /\b(m'?automutiler|automutilation|scarification)\b/i,
  /\bsurdose\b/i,
  /\bfaire\s+du\s+mal\s+à\s+(quelqu'?un|lui|elle|eux|ma|mon|les\s+gens)\b/i,
];

const MODERATE_PATTERNS_FR: RegExp[] = [
  /\b(mieux|meilleur)\s+(mort|morte)\b/i,
  /\b(mieux|meilleur)\s+sans\s+moi\b/i,
  /\bj'?aimerais\s+(ne\s+pas\s+(être\s+(né|là|ici))|disparaître|ne\s+plus\s+exister|ne\s+pas\s+me\s+réveiller)\b/i,
  /\bje\s+(veux|voudrais)\s+(juste\s+)?disparaître\b/i,
  /\bje\s+ne\s+veux\s+pas\s+me\s+réveiller\b/i,
  /\bà\s+quoi\s+(ça\s+sert|bon)\s+de\s+vivre\b/i,
  /\bfatigué(e)?\s+d'?(être\s+en\s+vie|exister|vivre)\b/i,
  /\bpersonne\s+ne\s+(remarquerait|s'?en\s+rendrait\s+compte|me\s+manquerait)\b/i,
];

const TIERS: { severity: CrisisSeverity; patterns: RegExp[] }[] = [
  {
    severity: "critical",
    patterns: [...CRITICAL_PATTERNS, ...CRITICAL_PATTERNS_AR, ...CRITICAL_PATTERNS_FR],
  },
  {
    severity: "high",
    patterns: [...HIGH_RISK_PATTERNS, ...HIGH_RISK_PATTERNS_AR, ...HIGH_RISK_PATTERNS_FR],
  },
  {
    severity: "moderate",
    patterns: [...MODERATE_PATTERNS, ...MODERATE_PATTERNS_AR, ...MODERATE_PATTERNS_FR],
  },
];

export const CRISIS_RESOURCES: CrisisResource[] = [
  {
    name: "Emergency services",
    contact: "Call your local emergency number",
    detail: "If you are in immediate danger, please get help right now.",
  },
  {
    name: "International",
    contact: "findahelpline.com",
    detail: "Find a free helpline anywhere in the world.",
  },
];

export const CRISIS_DISCLAIMER =
  "Kalm is a wellness companion, not a therapist or emergency service. Please reach out to a real person or one of the lines above.";

const CRISIS_MESSAGE_EN =
  "Thank you for telling me. What you just shared sounds really heavy, and I'm glad you said it out loud rather than carrying it alone. I'm not able to keep this part of the conversation going on my own, because you deserve support from someone trained for moments like this — right now. You are not in trouble, and you have not done anything wrong.";

type CrisisCopy = { message: string; disclaimer: string; resources: CrisisResource[] };

// English copy as a concrete value so `crisisCopy()` always has a non-undefined
// fallback even under `noUncheckedIndexedAccess`.
const EN_COPY: CrisisCopy = {
  message: CRISIS_MESSAGE_EN,
  disclaimer: CRISIS_DISCLAIMER,
  resources: CRISIS_RESOURCES,
};

/**
 * Localized crisis copy. DRAFT — pending clinician review for ar/fr.
 *
 * The app does not operate in the US, so no locale lists US lines (988 /
 * Crisis Text Line 741741). Every locale leads with the local emergency
 * number and findahelpline.com (which routes by country); `fr` also carries
 * 3114, France's national suicide-prevention line. Adding more
 * country-specific lines here is welcome — but only real, verified numbers.
 */
const CRISIS_COPY: Record<string, CrisisCopy> = {
  en: EN_COPY,
  ar: {
    message:
      "شكراً لأنك أخبرتني. ما شاركته الآن يبدو ثقيلاً جداً، وأنا ممتن أنك قلته بصوت عالٍ بدلاً من أن تحمله وحدك. لا أستطيع متابعة هذا الجزء من الحديث بمفردي، لأنك تستحق دعماً من شخص مدرّب لمثل هذه اللحظات — الآن. أنت لست في مشكلة، ولم تفعل أي شيء خطأ.",
    disclaimer:
      "كالم رفيق للعافية النفسية، وليس معالجاً أو خدمة طوارئ. تواصل من فضلك مع شخص حقيقي أو مع أحد الخطوط أعلاه.",
    resources: [
      {
        name: "دليل خطوط المساعدة الدولية",
        contact: "findahelpline.com",
        detail: "يوجّهك إلى خط دعم مجاني وسري في بلدك.",
      },
      {
        name: "خدمات الطوارئ",
        contact: "اتصل برقم الطوارئ في بلدك",
        detail: "إذا كنت في خطر مباشر، اطلب المساعدة الآن.",
      },
    ],
  },
  fr: {
    message:
      "Merci de me l'avoir dit. Ce que vous venez de partager semble très lourd, et je suis content que vous l'ayez exprimé plutôt que de le porter seul. Je ne peux pas poursuivre seul cette partie de la conversation, parce que vous méritez le soutien d'une personne formée pour ces moments — maintenant. Vous n'avez aucun ennui, et vous n'avez rien fait de mal.",
    disclaimer:
      "Kalm est un compagnon de bien-être, pas un thérapeute ni un service d'urgence. Contactez une personne réelle ou l'une des lignes ci-dessus.",
    resources: [
      {
        name: "3114 — Numéro national de prévention du suicide (France)",
        contact: "Appelez le 3114",
        detail: "Gratuit, confidentiel, 24h/24 et 7j/7.",
      },
      {
        name: "Services d'urgence",
        contact: "Appelez le 112 (Europe) ou le 15 (SAMU, France)",
        detail: "Si vous êtes en danger immédiat, demandez de l'aide maintenant.",
      },
      {
        name: "Annuaire international",
        contact: "findahelpline.com",
        detail: "Trouvez une ligne d'écoute gratuite dans votre pays.",
      },
    ],
  },
};

export function crisisCopy(language: string | null | undefined): CrisisCopy {
  return CRISIS_COPY[language ?? "en"] ?? EN_COPY;
}

/**
 * Deterministic regex gate with tiered triage. Patterns cover English, Arabic
 * and French; `matched` empty means no crisis language found in any of them.
 */
export function triageCrisis(text: string): {
  matched: string[];
  severity: CrisisSeverity | null;
} {
  const matched: string[] = [];
  let severity: CrisisSeverity | null = null;

  for (const tier of TIERS) {
    for (const pattern of tier.patterns) {
      const hit = text.match(pattern);
      if (hit) {
        matched.push(hit[0].toLowerCase());
        if (!severity) severity = tier.severity;
      }
    }
  }

  return { matched: [...new Set(matched)], severity };
}

/** Returns the matched crisis phrases; empty array means no crisis language found. */
export function detectCrisis(text: string): string[] {
  return triageCrisis(text).matched;
}

export function buildCrisisResponse(
  matched: string[],
  severity: CrisisSeverity = "high",
  language: string | null = "en",
): CrisisResponse {
  const copy = crisisCopy(language);
  return {
    type: "crisis",
    severity,
    message: copy.message,
    matched,
    resources: copy.resources,
    disclaimer: copy.disclaimer,
  };
}
