/**
 * The social posts Marketing publishes on a schedule (work package 3). Each one is fixed wording for the owner to
 * approve once in business memory; after that, Marketing's autopilot may post it without asking again.
 *
 * The only blanks are filled in by code, never by a model:
 * - `link`: the site page the post points to, in the post's language (the template's `path` on the site's address),
 * - `trial_days`: `billing.trial_days`, the free days the trial page promises.
 *
 * Every claim comes from the site's own guides and product pages, so a post never says more than the site does.
 */

export interface PostTemplate {
  title: string;
  /** Where it is posted: LinkedIn for agencies and owners of companies, Facebook for shops in Jordan. */
  channel: 'facebook' | 'linkedin';
  /** The site page `{{link}}` opens, after the language: '/trial' becomes https://site/en/trial. */
  path: string;
  en: string;
  ar: string;
}

export const POST_TEMPLATES: Record<string, PostTemplate> = {
  'post-trial': {
    title: 'Post: the free trial for shops',
    channel: 'facebook',
    path: '/trial',
    en: 'Run your shop on Zirr free for {{trial_days}} days: an online shop, a till and a back office in Arabic and English, set up for you on a short call.\n\nNo card needed to start.\n{{link}}',
    ar: 'جرّب زِرّ لمحلك مجاناً لمدة {{trial_days}} يوماً: متجر إلكتروني ونقطة بيع ولوحة إدارة بالعربي والإنجليزي، نجهّزها لك في مكالمة قصيرة.\n\nلا تحتاج إلى بطاقة للبدء.\n{{link}}',
  },
  'post-offline': {
    title: 'Post: the till keeps selling offline',
    channel: 'facebook',
    path: '/guides/offline-pos-for-shops',
    en: 'The internet dropped in the middle of a busy hour? Zirr tills keep selling. Each sale is saved on the device first and sent once the connection is back.\n{{link}}',
    ar: 'انقطع الإنترنت في وقت الذروة؟ صناديق زِرّ تواصل البيع. تُحفظ كل عملية على الجهاز أولاً وتُرسل عند عودة الاتصال.\n{{link}}',
  },
  'post-jofotara': {
    title: 'Post: JoFotara e-invoicing',
    channel: 'facebook',
    path: '/guides/jofotara-pos-jordan',
    en: 'Shops in Jordan send their invoices to JoFotara. Zirr Retail sends each sale once, even when the till retries, and prints a receipt in Arabic and English.\n{{link}}',
    ar: 'ترسل المحلات في الأردن فواتيرها إلى جوفوترا. يرسل زِرّ للتجزئة كل عملية بيع مرة واحدة حتى لو أعاد الجهاز المحاولة، ويطبع إيصالاً بالعربي والإنجليزي.\n{{link}}',
  },
  'post-cafe': {
    title: 'Post: a till for cafés and restaurants',
    channel: 'facebook',
    path: '/guides/cafe-restaurant-pos-amman',
    en: 'A café in Amman needs a till that is quick at the counter and clear in Arabic. Here is how Zirr POS works for cafés and restaurants.\n{{link}}',
    ar: 'المقهى في عمّان يحتاج صندوقاً سريعاً على الكاونتر وواضحاً بالعربي. هكذا يعمل زِرّ كاشير للمقاهي والمطاعم.\n{{link}}',
  },
  'post-agencies': {
    title: 'Post: Flutter work for agencies',
    channel: 'linkedin',
    path: '/guides/flutter-developers-for-agencies',
    en: 'Agencies: when there is more Flutter work than people, we build it under your name. You keep the client, the code lives in your repository from day one, and Arabic and English screens are done properly, right to left included.\n{{link}}',
    ar: 'إلى الوكالات: حين يكون لديكم عمل Flutter أكثر من فريقكم، نبنيه باسمكم. العميل يبقى لكم، والكود في مستودعكم من اليوم الأول، والشاشات العربية والإنجليزية متقنة من اليمين إلى اليسار.\n{{link}}',
  },
  'post-rtl': {
    title: 'Post: Arabic and English in one app',
    channel: 'linkedin',
    path: '/guides/arabic-english-shop-app',
    en: 'An Arabic app is more than translated words: the layout turns right to left, numbers and dates read naturally, and both languages are checked on every screen. How we build shop apps in Arabic and English:\n{{link}}',
    ar: 'التطبيق العربي أكثر من كلمات مترجمة: الواجهة تنقلب من اليمين إلى اليسار، والأرقام والتواريخ تُقرأ بشكل طبيعي، واللغتان تُراجعان في كل شاشة. هكذا نبني تطبيقات المتاجر بالعربي والإنجليزي:\n{{link}}',
  },
  'post-source-code': {
    title: 'Post: Zirr Retail source code',
    channel: 'linkedin',
    path: '/guides/flutter-ecommerce-admin-source-code',
    en: 'Zirr Retail is a Flutter and Supabase shop, back office and till in one codebase, with Arabic and English throughout. Agencies license it to start a client’s shop from working code instead of a blank page.\n{{link}}',
    ar: 'زِرّ للتجزئة متجر ولوحة إدارة ونقطة بيع بـ Flutter وSupabase في كود واحد، بالعربي والإنجليزي بالكامل. تشتري الوكالات ترخيصه لتبدأ متجر عميلها من كود يعمل بدل صفحة فارغة.\n{{link}}',
  },
  'post-compare': {
    title: 'Post: which Zirr fits your shop',
    channel: 'linkedin',
    path: '/guides/compare',
    en: 'Zirr Retail, Zirr POS or Zirr Boutique? One page compares them side by side, so you can see which one fits a shop, a café or a fashion boutique.\n{{link}}',
    ar: 'زِرّ للتجزئة أم زِرّ كاشير أم زِرّ بوتيك؟ صفحة واحدة تقارن بينها جنباً إلى جنب، لترى أيها يناسب المحل أو المقهى أو بوتيك الأزياء.\n{{link}}',
  },
};

export const POST_TEMPLATE_KEYS = Object.keys(POST_TEMPLATES);
