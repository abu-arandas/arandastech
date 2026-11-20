/**
 * The emails of the revenue engine: first outreach, follow-ups, meeting invitations, proposals, invoices and client
 * check-ins. New wording, for the owner to approve in business memory before any of it reaches a customer.
 *
 * Every value in double braces is filled in by code from the records and the policy sheet, never by a model:
 * - `name`, `first_name`, `company`: the lead (`first_name` is the name it is greeted by),
 * - `sender`: `sales.sender_name`, `showcase`: `sales.showcase_link`,
 * - `booking_line`: the booking link sentence (`sales.booking_link`), or a request for two times when it is not set,
 * - `opt_out`: the sentence that lets a prospect stop the emails,
 * - `number`, `title`, `total`, `link`, `due`, `valid_until`: the proposal or the invoice.
 */

interface Text {
  subject: string;
  body: string;
}
export interface SalesTemplate {
  title: string;
  en: Text;
  ar: Text;
}

const SIGN_EN = '{{sender}}\nZirr, Flutter studio in Amman';
const SIGN_AR = '{{sender}}\nزِرّ، استوديو Flutter في عمّان';

export const SALES_TEMPLATES: Record<string, SalesTemplate> = {
  // ---------------------------------------------------------------- Outreach to agencies (sequence "outreach")
  // Short, about one thing each, and each one adds something new. The first asks a question a busy person can answer
  // in one line; the call link comes in the second, once they know who is writing.
  'prospect-intro': {
    title: 'Outreach 1: first email to an agency',
    en: {
      subject: 'Extra Flutter hands for {{company}}',
      body: `Hi {{first_name}},\n\nWhen {{company}} has more Flutter work than people, I can take it on under your name: a fixed quote within two working days, a working build every week, and Arabic and English screens done properly, right to left included.\n\nI'm {{sender}}, a Flutter and Supabase developer in Amman. My own product, Zirr Retail (an online shop, back office and point of sale in one Flutter app), shows the standard I work to:\n{{showcase}}\n\nDo you ever pass app work to outside developers? A one-line reply is plenty.\n\n${SIGN_EN}\n\n{{opt_out}}`,
    },
    ar: {
      subject: 'مطوّر Flutter إضافي لفريق {{company}}',
      body: `مرحباً {{first_name}}،\n\nحين يكون لدى {{company}} عمل Flutter أكثر من فريقكم، أستطيع أن أتولّاه باسمكم: سعر ثابت خلال يومَي عمل، ونسخة تعمل كل أسبوع، وشاشات عربية وإنجليزية متقنة من اليمين إلى اليسار.\n\nأنا {{sender}}، مطوّر Flutter وSupabase في عمّان. منتجي زِرّ للتجزئة (متجر إلكتروني ولوحة إدارة ونقطة بيع في تطبيق Flutter واحد) يُظهر مستوى العمل الذي ألتزم به:\n{{showcase}}\n\nهل تُسندون أحياناً مشاريع تطبيقات إلى مطوّرين من خارج الفريق؟ يكفيني ردّ بسطر واحد.\n\n${SIGN_AR}\n\n{{opt_out}}`,
    },
  },
  'prospect-follow-up': {
    title: 'Outreach 2: follow-up to an agency',
    en: {
      subject: 'Re: Extra Flutter hands for {{company}}',
      body: `Hi {{first_name}},\n\nOne thing I should have said: agencies usually start me on something small, such as one screen, a bug list or a prototype, so you can judge the work before a bigger project. I sign your NDA, the code lives in your repository from the first day, and your client never sees my name.\n\nIf that could help at {{company}}:\n{{booking_line}}\n\n${SIGN_EN}\n\n{{opt_out}}`,
    },
    ar: {
      subject: 'رد: مطوّر Flutter إضافي لفريق {{company}}',
      body: `مرحباً {{first_name}}،\n\nفاتني أن أذكر أمراً: عادةً تبدأ الوكالات معي بعمل صغير، مثل شاشة واحدة أو قائمة أخطاء أو نموذج أوّلي، لتحكموا على العمل قبل أي مشروع أكبر. أوقّع اتفاقية السرية الخاصة بكم، ويكون الكود في مستودعكم من اليوم الأول، ولا يرى عميلكم اسمي أبداً.\n\nإن كان هذا يفيد {{company}}:\n{{booking_line}}\n\n${SIGN_AR}\n\n{{opt_out}}`,
    },
  },
  'prospect-close': {
    title: 'Outreach 3: last email',
    en: {
      subject: 'Re: Extra Flutter hands for {{company}}',
      body: `Hi {{first_name}},\n\nI'll stop here so I don't fill your inbox. If someone else at {{company}} looks after outside developers, I'd be grateful for their name.\n\nAnd if Flutter work comes up later, a reply to this email reaches me any time, and I answer within one working day.\n\nThank you for reading.\n\n${SIGN_EN}`,
    },
    ar: {
      subject: 'رد: مطوّر Flutter إضافي لفريق {{company}}',
      body: `مرحباً {{first_name}}،\n\nسأتوقّف هنا كي لا أثقل بريدكم. إن كان في {{company}} شخص آخر يتولّى التعامل مع المطوّرين من خارج الفريق، أكون شاكراً لو أرسلتم لي اسمه.\n\nوإن ظهر عمل Flutter لاحقاً، فالردّ على هذه الرسالة يصلني في أي وقت، وأجيب خلال يوم عمل واحد.\n\nشكراً لوقتكم.\n\n${SIGN_AR}`,
    },
  },

  // Version B of the first email, for the A/B test (crm/ab-tests.ts): once the owner approves it, half the prospects get
  // it, and Sales keeps whichever version gets the higher reply rate.
  'prospect-intro.b': {
    title: 'Outreach 1, version B: a small first job at a fixed $150 (A/B test)',
    en: {
      subject: 'A small Flutter job to try us, {{company}}',
      body: `Hi {{first_name}},\n\nA simple way to try outside help at {{company}}: give me one small Flutter task, such as a screen, a bug list or an Arabic right-to-left fix, and I'll do it for a fixed $150. If you like the work, you know who to call when a bigger project comes.\n\nI'm {{sender}}, a Flutter and Supabase developer in Amman, and I work under your name: your NDA, your repository, your client. My own product, Zirr Retail, shows the standard:\n{{showcase}}\n\nIs there a small task on your list right now? A one-line reply is plenty.\n\n${SIGN_EN}\n\n{{opt_out}}`,
    },
    ar: {
      subject: 'مهمة Flutter صغيرة لتجربتنا، {{company}}',
      body: `مرحباً {{first_name}}،\n\nطريقة بسيطة لتجربة مطوّر من خارج فريق {{company}}: أعطوني مهمة Flutter صغيرة، مثل شاشة واحدة أو قائمة أخطاء أو إصلاح اتجاه العربية، وأنجزها بسعر ثابت 150 دولاراً. وإن أعجبكم العمل، تعرفون من تطلبون حين يأتي مشروع أكبر.\n\nأنا {{sender}}، مطوّر Flutter وSupabase في عمّان، وأعمل باسمكم: اتفاقية السرية الخاصة بكم، ومستودعكم، وعميلكم. منتجي زِرّ للتجزئة يُظهر مستوى العمل:\n{{showcase}}\n\nهل لديكم مهمة صغيرة على القائمة الآن؟ يكفيني ردّ بسطر واحد.\n\n${SIGN_AR}\n\n{{opt_out}}`,
    },
  },

  // ---------------------------------------------------------------- Outreach to shops, cafés and restaurants ("outreach_shop")
  'shop-intro': {
    title: 'Shop outreach 1: point of sale and online shop',
    en: {
      subject: 'A till and online shop for {{company}}',
      body: `Hi {{first_name}},\n\nI'm {{sender}} from Zirr in Amman. We make a till and an online shop that share one stock list, print receipts in Arabic and English, and keep selling when the internet drops. In Jordan they also send your JoFotara e-invoices.\n\nWe set it up with your own products, and you try it free for 14 days before paying anything:\n{{showcase}}\n\nWould a free trial be worth a look for {{company}}? A one-line reply is plenty.\n\n${SIGN_EN}\n\n{{opt_out}}`,
    },
    ar: {
      subject: 'نظام كاشير ومتجر إلكتروني لـ {{company}}',
      body: `مرحباً {{first_name}}،\n\nأنا {{sender}} من زِرّ في عمّان. نصنع نظام كاشير ومتجراً إلكترونياً بقائمة مخزون واحدة، يطبعان الفواتير بالعربي والإنجليزي، ويستمر البيع حتى لو انقطع الإنترنت. وفي الأردن يرسلان فواتير «جوفوترا» الإلكترونية عنكم.\n\nنجهّزه بمنتجاتكم، وتجرّبونه مجاناً 14 يوماً قبل أن تدفعوا شيئاً:\n{{showcase}}\n\nهل تستحق التجربة المجانية نظرة من {{company}}؟ يكفيني ردّ بسطر واحد.\n\n${SIGN_AR}\n\n{{opt_out}}`,
    },
  },
  // Version B of the shop's first email (A/B test): the price and WhatsApp up front, for owners who decide quickly.
  'shop-intro.b': {
    title: 'Shop outreach 1, version B: price and WhatsApp up front (A/B test)',
    en: {
      subject: '14 days free, then 299 JOD once: a till for {{company}}',
      body: `Hi {{first_name}},\n\nI'm {{sender}} from Zirr in Amman. Our till prints receipts in Arabic and English, keeps selling when the internet drops, and runs the tables and the kitchen if you serve food.\n\nWe install it on your PC with your own products and train your staff. You use it free for 14 days; if you keep it, it is 299 JOD once, with no monthly fee:\n{{showcase}}\n\nReply here, or message us on WhatsApp at +962 79 156 8798, and we will set up the trial this week.\n\n${SIGN_EN}\n\n{{opt_out}}`,
    },
    ar: {
      subject: '14 يوماً مجاناً ثم 299 ديناراً مرة واحدة: نظام كاشير لـ {{company}}',
      body: `مرحباً {{first_name}}،\n\nأنا {{sender}} من زِرّ في عمّان. نظام الكاشير لدينا يطبع الفواتير بالعربي والإنجليزي، ويستمر في البيع حتى لو انقطع الإنترنت، ويدير الطاولات والمطبخ إن كنتم تقدّمون الطعام.\n\nنركّبه على جهازكم بمنتجاتكم وندرّب موظفيكم. تستخدمونه مجاناً 14 يوماً، وإن احتفظتم به فسعره 299 ديناراً مرة واحدة دون رسوم شهرية:\n{{showcase}}\n\nردّوا هنا، أو راسلونا على واتساب على الرقم ‎+962 79 156 8798‎، وسنجهّز التجربة هذا الأسبوع.\n\n${SIGN_AR}\n\n{{opt_out}}`,
    },
  },
  'shop-follow-up': {
    title: 'Shop outreach 2: follow-up',
    en: {
      subject: 'Re: A till and online shop for {{company}}',
      body: `Hi {{first_name}},\n\nA short follow-up, with how the free trial works: we add your products, show your staff the till, and leave it running. For 14 days you sell on it as normal. If it doesn't help, you pay nothing and we take it away.\n\nTo see it with your own products:\n{{booking_line}}\n\n${SIGN_EN}\n\n{{opt_out}}`,
    },
    ar: {
      subject: 'رد: نظام كاشير ومتجر إلكتروني لـ {{company}}',
      body: `مرحباً {{first_name}}،\n\nمتابعة قصيرة، مع طريقة التجربة المجانية: نضيف منتجاتكم، ونُري موظفيكم نظام الكاشير، ونتركه يعمل. لمدة 14 يوماً تبيعون عليه كالمعتاد، وإن لم يفدكم فلا تدفعون شيئاً ونزيله.\n\nلتروه بمنتجاتكم:\n{{booking_line}}\n\n${SIGN_AR}\n\n{{opt_out}}`,
    },
  },

  'shop-close': {
    title: 'Shop outreach 3: last email',
    en: {
      subject: 'Re: A till and online shop for {{company}}',
      body: `Hi {{first_name}},\n\nThis is my last email for now. If someone else at {{company}} decides on the till, I'd be grateful if you passed this on.\n\nAnd if you want the free trial later, reply to this email any time and we will set it up.\n\nThank you for reading.\n\n${SIGN_EN}`,
    },
    ar: {
      subject: 'رد: نظام كاشير ومتجر إلكتروني لـ {{company}}',
      body: `مرحباً {{first_name}}،\n\nهذه آخر رسالة مني الآن. إن كان شخص آخر في {{company}} يقرّر بشأن نظام الكاشير، أكون شاكراً لو أوصلتم له هذه الرسالة.\n\nوإن أردتم التجربة المجانية لاحقاً، ردّوا على هذه الرسالة في أي وقت وسنجهّزها لكم.\n\nشكراً لوقتكم.\n\n${SIGN_AR}`,
    },
  },

  // ---------------------------------------------------------------- Leads who wrote to us first ("inbound")
  'lead-follow-up': {
    title: 'Follow-up to a website lead',
    en: {
      subject: 'Re: your message to Zirr',
      body: `Hi {{first_name}},\n\nI'm following up on the message you sent us. To give you a firm price, I need three things: what the app must do, who will use it, and when you need it.\n\nA short call usually covers all three:\n{{booking_line}}\n\nIf you'd rather write, reply with them here and I'll send the quote within two working days.\n\n${SIGN_EN}`,
    },
    ar: {
      subject: 'رد: رسالتك إلى زِرّ',
      body: `مرحباً {{first_name}}،\n\nأتابع معك بخصوص رسالتك إلينا. لأرسل لك سعراً ثابتاً، أحتاج إلى ثلاثة أمور: ما الذي يجب أن يقوم به التطبيق، ومن سيستخدمه، ومتى تحتاجه.\n\nمكالمة قصيرة تغطّي الثلاثة عادةً:\n{{booking_line}}\n\nوإن كنت تفضّل الكتابة، أرسلها رداً على هذه الرسالة وسأرسل لك السعر خلال يومَي عمل.\n\n${SIGN_AR}`,
    },
  },
  'meeting-invite': {
    title: 'Answer to a prospect who replied: book a call',
    en: {
      subject: 'Re: a call with Zirr',
      body: `Hi {{first_name}},\n\nThank you for your reply. The quickest next step is a short call: you tell me what you need, I show you work like it, and you get a fixed quote within two working days.\n\n{{booking_line}}\n\n${SIGN_EN}`,
    },
    ar: {
      subject: 'رد: مكالمة مع زِرّ',
      body: `مرحباً {{first_name}}،\n\nشكراً لردّك. أسرع خطوة تالية مكالمة قصيرة: تخبرني بما تحتاجونه، وأريك عملاً مشابهاً، ويصلك سعر ثابت خلال يومَي عمل.\n\n{{booking_line}}\n\n${SIGN_AR}`,
    },
  },

  // ---------------------------------------------------------------- Proposals ("proposal")
  proposal: {
    title: 'Proposal email',
    en: {
      subject: 'Proposal {{number}}: {{title}}',
      body: `Hello {{name}},\n\nThank you for the call. Here is the proposal for {{title}}, with the scope and the price: {{total}}.\n\nRead it and accept it here: {{link}}\n\nOnce you accept, the first invoice comes to you by email. The proposal is valid until {{valid_until}}. Reply to this email with any question or change.\n\n${SIGN_EN}`,
    },
    ar: {
      subject: 'عرض السعر {{number}}: {{title}}',
      body: `مرحباً {{name}}،\n\nشكراً على المكالمة. هذا عرض السعر لـ {{title}}، بنطاق العمل والسعر: {{total}}.\n\nاقرأه ووافق عليه من هنا: {{link}}\n\nبعد موافقتك تصلك الفاتورة الأولى بالبريد. العرض ساري حتى {{valid_until}}. ردّ على هذه الرسالة بأي سؤال أو تعديل.\n\n${SIGN_AR}`,
    },
  },
  'proposal-reminder': {
    title: 'Proposal reminder',
    en: {
      subject: 'Re: Proposal {{number}}: {{title}}',
      body: `Hello {{name}},\n\nA short reminder about proposal {{number}} for {{title}}. It is valid until {{valid_until}}, and you can accept it here: {{link}}\n\nIf something in it doesn't fit, tell me what, and I'll change it.\n\n${SIGN_EN}`,
    },
    ar: {
      subject: 'رد: عرض السعر {{number}}: {{title}}',
      body: `مرحباً {{name}}،\n\nتذكير قصير بعرض السعر {{number}} لـ {{title}}. العرض ساري حتى {{valid_until}}، ويمكنك الموافقة عليه من هنا: {{link}}\n\nإن كان فيه ما لا يناسبك، أخبرني به وسأعدّله.\n\n${SIGN_AR}`,
    },
  },

  // ---------------------------------------------------------------- Invoices
  invoice: {
    title: 'Invoice email',
    en: {
      subject: 'Invoice {{number}}: {{title}}',
      body: `Hello {{name}},\n\nHere is invoice {{number}} for {{title}}: {{total}}, due on {{due}}.\n\nThe invoice and how to pay it: {{link}}\n\nThank you.\n\n${SIGN_EN}`,
    },
    ar: {
      subject: 'الفاتورة {{number}}: {{title}}',
      body: `مرحباً {{name}}،\n\nهذه الفاتورة {{number}} لـ {{title}}: {{total}}، تستحق في {{due}}.\n\nالفاتورة وطريقة الدفع: {{link}}\n\nشكراً لك.\n\n${SIGN_AR}`,
    },
  },
  'invoice-reminder': {
    title: 'Invoice reminder',
    en: {
      subject: 'Re: Invoice {{number}}: {{title}}',
      body: `Hello {{name}},\n\nA friendly reminder that invoice {{number}} ({{total}}) was due on {{due}}. The details and how to pay are here: {{link}}\n\nIf it is already paid, thank you, and please ignore this email.\n\n${SIGN_EN}`,
    },
    ar: {
      subject: 'رد: الفاتورة {{number}}: {{title}}',
      body: `مرحباً {{name}}،\n\nتذكير لطيف بأن الفاتورة {{number}} ({{total}}) كانت مستحقة في {{due}}. التفاصيل وطريقة الدفع هنا: {{link}}\n\nإن كانت مدفوعة، فشكراً لك، وتجاهل هذه الرسالة.\n\n${SIGN_AR}`,
    },
  },
  'payment-received': {
    title: 'Thank-you for a payment',
    en: {
      subject: 'Payment received: {{number}}',
      body: `Hello {{name}},\n\nThank you. We received your payment of {{total}} for invoice {{number}}.\n\n${SIGN_EN}`,
    },
    ar: {
      subject: 'وصلنا الدفع: {{number}}',
      body: `مرحباً {{name}}،\n\nشكراً لك. وصلنا دفعك بقيمة {{total}} للفاتورة {{number}}.\n\n${SIGN_AR}`,
    },
  },

  // ---------------------------------------------------------------- After delivery ("check_in")
  'client-check-in': {
    title: 'Client check-in, two weeks after payment',
    en: {
      subject: 'How is everything going?',
      body: `Hello {{name}},\n\nIt has been two weeks, so I wanted to ask: is everything working as you need? If anything needs a fix or a change, reply to this email and I'll take care of it.\n\n${SIGN_EN}`,
    },
    ar: {
      subject: 'كيف تسير الأمور؟',
      body: `مرحباً {{name}}،\n\nمرّ أسبوعان، فأردت أن أسأل: هل كل شيء يعمل كما تحتاج؟ إن احتاج أي شيء إلى إصلاح أو تعديل، ردّ على هذه الرسالة وسأتولّاه.\n\n${SIGN_AR}`,
    },
  },
  'client-referral': {
    title: 'Client check-in, two months after payment',
    en: {
      subject: 'A quick hello from Zirr',
      body: `Hello {{name}},\n\nI hope the work is serving you well. If you have a next project in mind, I'd be glad to help. And if you know one business that needs a Flutter app or a till, an introduction by email is the best thank-you there is.\n\n{{booking_line}}\n\n${SIGN_EN}`,
    },
    ar: {
      subject: 'تحية سريعة من زِرّ',
      body: `مرحباً {{name}}،\n\nأتمنى أن يكون العمل مفيداً لكم. إن كان لديكم مشروع قادم، يسعدني أن أساعد. وإن كنتم تعرفون نشاطاً تجارياً يحتاج تطبيق Flutter أو نظام كاشير، فتعريفنا ببعض عبر البريد هو أجمل شكر.\n\n{{booking_line}}\n\n${SIGN_AR}`,
    },
  },
};

/** The sentences code puts into the templates. */
export const SALES_LINES = {
  booking: {
    en: (link: string) => `Pick a 20-minute call at a time that suits you: ${link}`,
    ar: (link: string) => `اختر موعداً لمكالمة مدتها 20 دقيقة في الوقت الذي يناسبك: ${link}`,
  },
  noBooking: {
    en: 'Reply with two times that suit you this week, and I will send a call link.',
    ar: 'ردّ بموعدين يناسبانك هذا الأسبوع، وسأرسل لك رابط المكالمة.',
  },
  optOut: {
    en: 'If this isn\'t relevant, reply "no thanks" and I won\'t write again.',
    ar: 'إن لم يكن هذا مناسباً، ردّ بكلمة «لا شكراً» ولن أراسلك مجدداً.',
  },
  optOutLink: {
    en: (link: string) => `If this isn't relevant, reply "no thanks" or open ${link} and I won't write again.`,
    ar: (link: string) => `إن لم يكن هذا مناسباً، ردّ بكلمة «لا شكراً» أو افتح ${link} ولن أراسلك مجدداً.`,
  },
} as const;

/** The templates a standing rule may send on its own: fixed wording filled in from the records. */
export const SALES_TEMPLATE_KEYS = Object.keys(SALES_TEMPLATES);
