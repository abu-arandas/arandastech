import type { LeadRow } from './crm';

/**
 * The fixed rules that score a lead (blueprint 7.3 Sales: approved criteria). Every point comes with its reason, so the
 * owner can see why a lead scored what it did. No model is needed, and when a model scores too, these rules still have
 * their say: the two are averaged, and the rules alone decide when a message is spam or a job application.
 *
 * Two scores, for two kinds of lead:
 * - `scoreLead`: someone who wrote to us through the website. How likely is this to become agreed work?
 * - `scoreProspect`: a business the owner chose to contact. How well does it fit, so the best ones are written to first?
 */

export interface Score {
  score: number;
  reasons: string[];
}

/** Lead scores at or above this are qualified. */
export const QUALIFIED = 60;

const FREE_MAIL =
  /@(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|aol|proton|protonmail|pm|mail|gmx|yandex|zoho)\./i;
const THROWAWAY_MAIL =
  /@(mailinator|guerrillamail|10minutemail|tempmail|temp-mail|yopmail|trashmail|sharklasers|getnada|dispostable)\./i;

/** A sum of money: a currency next to a number, in English or Arabic, such as "$5k", "3000 JOD" or "٥٠٠٠ دينار". */
const AMOUNT =
  /(\$|usd|jod|jd|eur|€|aed|sar|dinars?|dollars?|دينار|دولار|ريال|درهم)\s?[\d٠-٩][\d٠-٩,.]*\s?k?|[\d٠-٩][\d٠-٩,.]*\s?(k|thousand|ألف|الف)?\s?(\$|usd|jod|jd|eur|€|aed|sar|dinars?|dollars?|دينار|دولار|ريال|درهم)/i;
const BUDGET = /\b(budget|quote|pricing|price|cost|estimate)\b|ميزاني|سعر|تكلف|عرض سعر/i;
const TIMELINE =
  /\b(deadline|launch|timeline|start(ing)?|by (the )?end of|next (week|month)|this (week|month)|q[1-4]|january|february|march|april|june|july|august|september|october|november|december|(in|by|for|from|early|mid|late|end of) may|may \d{1,4})\b|موعد|أسبوع|اسبوع|شهر|إطلاق|اطلاق|نبدأ|نهاية/i;
const URGENT = /\b(asap|urgent(ly)?|as soon as possible|right away|immediately)\b|عاجل|بأسرع وقت|ضروري|فوراً|فورا/i;
const APP_WORK =
  /\b(app|apps|flutter|mobile|android|ios|e-?commerce|online (shop|store)|point of sale|pos|dashboard|mvp|supabase|firebase)\b|تطبيق|متجر|كاشير|نقطة بيع|لوحة/i;
const JOB_SEEKER =
  /\b(cv|resume|résumé|internship|intern|hire me|looking for (a )?(job|work|position)|job (opening|application)|vacanc(y|ies))\b|سيرتي الذاتية|السيرة الذاتية|وظيفة|تدريب|أبحث عن عمل|ابحث عن عمل/i;
const SELLING_TO_US =
  /\b(seo services|backlinks?|guest post|link building|rank (your|on)|we (are|offer) (a|an)?\s?(digital marketing|seo|lead generation)|outsourc(e|ing) partner|crypto|casino|forex|loan offer)\b|نقدم (لكم )?خدمات|خدمات (التسويق|تسويق|السيو)|تحسين محركات البحث|السيو|روابط خلفية|باك ?لينك|مقالات ضيف/i;
const LINK = /https?:\/\/|www\./gi;

/** The score of someone who wrote to us. `flagged` is true when the message tries to give the bots instructions. */
export function scoreLead(
  lead: Pick<LeadRow, 'email' | 'phone' | 'package_id' | 'message'> & Partial<Pick<LeadRow, 'project_type'>>,
  flagged: boolean,
): Score {
  if (flagged) return { score: 0, reasons: ['The message tries to give instructions, so it is not scored.'] };
  const tally = new Tally(20, 'every website lead starts here');
  const message = lead.message.trim();
  if (SELLING_TO_US.test(message)) tally.add(-40, 'sells us a service, not work for us');
  if (JOB_SEEKER.test(message)) tally.add(-30, 'reads like a job application, not a project');
  if ((message.match(LINK) ?? []).length >= 3) tally.add(-20, 'is mostly links');
  if (THROWAWAY_MAIL.test(lead.email)) tally.add(-20, 'writes from a throwaway address');
  if (lead.package_id) tally.add(20, 'chose a package');
  else if (lead.project_type) tally.add(5, 'said what kind of project it is');
  if (message.length >= 300) tally.add(15, 'described the work in detail');
  else if (message.length >= 120) tally.add(10, 'described the work');
  else if (message.length < 25) tally.add(-10, 'said very little');
  if (AMOUNT.test(message)) tally.add(15, 'names a budget');
  else if (BUDGET.test(message)) tally.add(5, 'asks about the price');
  if (TIMELINE.test(message)) tally.add(10, 'mentions a timeline or a start');
  if (URGENT.test(message)) tally.add(5, 'needs it soon');
  if (APP_WORK.test(message)) tally.add(5, 'asks for the kind of work we do');
  if (!FREE_MAIL.test(lead.email) && !THROWAWAY_MAIL.test(lead.email)) tally.add(15, 'writes from a company address');
  if (lead.phone) tally.add(10, 'left a phone number');
  // Someone selling to us, looking for a job or hiding behind a throwaway address is never qualified, however much
  // else the message has.
  if (notABuyer(lead)) return tally.result(NOT_A_BUYER_CAP, `capped at ${NOT_A_BUYER_CAP}: not a buyer`);
  return tally.result();
}

/** The most a lead the rules call a non-buyer can score, well under `QUALIFIED`. */
const NOT_A_BUYER_CAP = 10;

/** True when the rules alone say the lead is not a buyer, whatever a model thinks of it. */
const notABuyer = (lead: Pick<LeadRow, 'message' | 'email'>): boolean =>
  SELLING_TO_US.test(lead.message) || JOB_SEEKER.test(lead.message) || THROWAWAY_MAIL.test(lead.email);

const SUMMARY = /^Rules \d+, assistant (\d+), average \d+\.$/;
const ASSISTANT = 'Assistant: ';

/**
 * A model's score checked by the rules: the two are averaged, so a message written to please a model cannot push a lead
 * past the rules on its own, and a lead the rules call spam or a job application keeps the rules' score.
 */
export function combineScores(rules: Score, model: Score | null, lead: Pick<LeadRow, 'message' | 'email'>): Score {
  if (!model || notABuyer(lead)) return rules;
  const score = Math.round((rules.score + model.score) / 2);
  return {
    score,
    reasons: [
      `Rules ${rules.score}, assistant ${model.score}, average ${score}.`,
      ...rules.reasons,
      ...model.reasons.map((reason) => `${ASSISTANT}${reason}`),
    ],
  };
}

/**
 * The assistant's score kept in a lead's stored reasons, so scoring the lead again by the rules keeps the assistant's
 * part instead of losing it.
 */
export function assistantScore(reasons: string[]): Score | null {
  const found = SUMMARY.exec(reasons[0] ?? '');
  if (!found) return null;
  return {
    score: Number(found[1]),
    reasons: reasons.filter((reason) => reason.startsWith(ASSISTANT)).map((reason) => reason.slice(ASSISTANT.length)),
  };
}

/** Where agencies who buy Flutter work from us usually are, by the country the owner typed. */
const NEAR =
  /^(jo|jordan|الأردن|الاردن|sa|ksa|saudi( arabia)?|السعودية|ae|uae|united arab emirates|الإمارات|الامارات|qa|qatar|قطر|kw|kuwait|الكويت|bh|bahrain|البحرين|om|oman|عمان|عُمان|eg|egypt|مصر|ps|palestine|فلسطين|lb|lebanon|لبنان|iq|iraq|العراق)$/i;
const DOMAIN = /^(?:https?:\/\/)?(?:www\.)?([^/:?#]+)/i;

const siteDomain = (website: string): string | null => DOMAIN.exec(website.trim())?.[1]?.toLowerCase() ?? null;

/** The fit of a business the owner chose to contact. Better fits get their first email first under the daily limit. */
export function scoreProspect(prospect: {
  email: string;
  website?: string | null;
  country?: string | null;
  notes?: string | null;
  value?: string | null;
}): Score {
  const tally = new Tally(30, 'every prospect starts here');
  const domain = prospect.email.split('@')[1]?.toLowerCase() ?? '';
  const site = prospect.website ? siteDomain(prospect.website) : null;
  if (site) tally.add(10, 'has a website');
  if (site && domain && (site === domain || site.endsWith(`.${domain}`) || domain.endsWith(`.${site}`)))
    tally.add(15, 'the address is on its own website');
  if (FREE_MAIL.test(prospect.email)) tally.add(-10, 'a personal address, not the company');
  else tally.add(10, 'a company address');
  if (prospect.country && NEAR.test(prospect.country.trim())) tally.add(10, 'in Jordan or the region');
  if (prospect.notes && APP_WORK.test(prospect.notes)) tally.add(15, 'the notes say it does app work');
  if (prospect.value) tally.add(10, 'the owner expects a deal value');
  return tally.result();
}

/** Points with their reasons, kept between 0 and 100. */
class Tally {
  private readonly reasons: string[];
  constructor(
    private score: number,
    base: string,
  ) {
    this.reasons = [`${score}: ${base}`];
  }

  add(points: number, reason: string): void {
    this.score += points;
    this.reasons.push(`${points > 0 ? '+' : ''}${points}: ${reason}`);
  }

  result(cap = 100, capReason?: string): Score {
    const reasons = capReason && this.score > cap ? [...this.reasons, capReason] : this.reasons;
    return { score: Math.max(0, Math.min(cap, this.score)), reasons };
  }
}
