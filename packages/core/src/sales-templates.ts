/**
 * The emails of the revenue engine: first outreach, follow-ups, meeting invitations, proposals, invoices and client
 * check-ins. New wording, for the owner to approve in business memory before any of it reaches a customer.
 *
 * Every value in double braces is filled in by code from the records and the policy sheet, never by a model:
 * - `name`, `company`: the lead,
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
  'prospect-intro': {
    title: 'Outreach 1: first email to an agency',
    en: {
      subject: 'Flutter help for {{company}}',
      body: `Hello {{name}},\n\nI'm {{sender}}, a Flutter and Supabase developer in Amman. I build Arabic and English apps under an agency's own name, so your clients only ever see {{company}}.\n\nWhen you have more app work than people, I can take a project at a fixed quote, or keep days free for you every month. My own work, including Zirr Retail (an online shop, back office and point of sale in one Flutter app), is here: {{showcase}}\n\n{{booking_line}}\n\n${SIGN_EN}\n\n{{opt_out}}`,
    },
    ar: {
      subject: 'مساعدة في Flutter لـ {{company}}',
      body: `مرحباً {{name}}،\n\nأنا {{sender}}، مطوّر Flutter وSupabase في عمّان. أبني تطبيقات بالعربي والإنجليزي باسم الوكالة نفسها، فلا يرى عملاؤكم إلا اسم {{company}}.\n\nحين يكون لديكم عمل أكثر من فريقكم، أستطيع أن أتولّى مشروعاً بسعر ثابت، أو أحجز لكم أياماً كل شهر. أعمالي، ومنها زِرّ للتجزئة (متجر إلكتروني ولوحة إدارة ونقطة بيع في تطبيق Flutter واحد)، هنا: {{showcase}}\n\n{{booking_line}}\n\n${SIGN_AR}\n\n{{opt_out}}`,
    },
  },
  'prospect-follow-up': {
    title: 'Outreach 2: follow-up to an agency',
    en: {
      subject: 'Re: Flutter help for {{company}}',
      body: `Hello {{name}},\n\nA short follow-up to my last email. If a Flutter project is waiting for a free developer at {{company}}, I can send a fixed quote within two working days of seeing the brief, and show you a working build every week.\n\n{{booking_line}}\n\n${SIGN_EN}\n\n{{opt_out}}`,
    },
    ar: {
      subject: 'رد: مساعدة في Flutter لـ {{company}}',
      body: `مرحباً {{name}}،\n\nمتابعة قصيرة لرسالتي السابقة. إن كان لدى {{company}} مشروع Flutter ينتظر مطوّراً متفرّغاً، أرسل لكم سعراً ثابتاً خلال يومَي عمل من قراءة المتطلبات، وتشاهدون نسخة تعمل كل أسبوع.\n\n{{booking_line}}\n\n${SIGN_AR}\n\n{{opt_out}}`,
    },
  },
  'prospect-close': {
    title: 'Outreach 3: last email',
    en: {
      subject: 'Re: Flutter help for {{company}}',
      body: `Hello {{name}},\n\nI won't keep writing, so this is my last email for now. If Flutter work comes up later, reply to this email any time and I'll answer within one working day.\n\nThank you for reading.\n\n${SIGN_EN}`,
    },
    ar: {
      subject: 'رد: مساعدة في Flutter لـ {{company}}',
      body: `مرحباً {{name}}،\n\nلا أريد أن أثقل عليكم، فهذه آخر رسالة مني الآن. إن احتجتم إلى عمل Flutter لاحقاً، ردّوا على هذه الرسالة في أي وقت وسأجيب خلال يوم عمل واحد.\n\nشكراً لوقتكم.\n\n${SIGN_AR}`,
    },
  },

  // ---------------------------------------------------------------- Outreach to shops, cafés and restaurants ("outreach_shop")
  'shop-intro': {
    title: 'Shop outreach 1: point of sale and online shop',
    en: {
      subject: 'A point of sale and online shop for {{company}}',
      body: `Hello {{name}},\n\nI'm {{sender}} from Zirr in Amman. We make a point of sale and an online shop that work in Arabic and English, share one stock list, and keep selling when the internet drops.\n\nWe install it for you, and you try it free for 14 days before paying anything. You can see it here: {{showcase}}\n\n{{booking_line}}\n\n${SIGN_EN}\n\n{{opt_out}}`,
    },
    ar: {
      subject: 'نظام كاشير ومتجر إلكتروني لـ {{company}}',
      body: `مرحباً {{name}}،\n\nأنا {{sender}} من زِرّ في عمّان. نصنع نظام كاشير ومتجراً إلكترونياً يعملان بالعربي والإنجليزي، بقائمة مخزون واحدة، ويستمر البيع حتى لو انقطع الإنترنت.\n\nنركّبه عندكم، وتجرّبونه مجاناً 14 يوماً قبل أن تدفعوا شيئاً. تجدونه هنا: {{showcase}}\n\n{{booking_line}}\n\n${SIGN_AR}\n\n{{opt_out}}`,
    },
  },
  'shop-follow-up': {
    title: 'Shop outreach 2: follow-up',
    en: {
      subject: 'Re: A point of sale and online shop for {{company}}',
      body: `Hello {{name}},\n\nA short follow-up. The 14-day free trial still stands: we set it up with your own products, and you keep it only if it helps.\n\n{{booking_line}}\n\n${SIGN_EN}\n\n{{opt_out}}`,
    },
    ar: {
      subject: 'رد: نظام كاشير ومتجر إلكتروني لـ {{company}}',
      body: `مرحباً {{name}}،\n\nمتابعة قصيرة. التجربة المجانية لمدة 14 يوماً ما زالت متاحة: نجهّزها بمنتجاتكم، وتحتفظون بها فقط إن أفادتكم.\n\n{{booking_line}}\n\n${SIGN_AR}\n\n{{opt_out}}`,
    },
  },

  'shop-close': {
    title: 'Shop outreach 3: last email',
    en: {
      subject: 'Re: A point of sale and online shop for {{company}}',
      body: `Hello {{name}},\n\nThis is my last email for now. If you want to try the point of sale or the online shop later, reply to this email any time and we will set up your free trial.\n\nThank you for reading.\n\n${SIGN_EN}`,
    },
    ar: {
      subject: 'رد: نظام كاشير ومتجر إلكتروني لـ {{company}}',
      body: `مرحباً {{name}}،\n\nهذه آخر رسالة مني الآن. إن أردتم تجربة نظام الكاشير أو المتجر الإلكتروني لاحقاً، ردّوا على هذه الرسالة في أي وقت وسنجهّز لكم التجربة المجانية.\n\nشكراً لوقتكم.\n\n${SIGN_AR}`,
    },
  },

  // ---------------------------------------------------------------- Leads who wrote to us first ("inbound")
  'lead-follow-up': {
    title: 'Follow-up to a website lead',
    en: {
      subject: 'Re: your message to Zirr',
      body: `Hello {{name}},\n\nI'm following up on the message you sent us. A short call is usually the quickest way to agree the scope and the price.\n\n{{booking_line}}\n\n${SIGN_EN}`,
    },
    ar: {
      subject: 'رد: رسالتك إلى زِرّ',
      body: `مرحباً {{name}}،\n\nأتابع معك بخصوص رسالتك إلينا. مكالمة قصيرة هي عادةً أسرع طريقة لنتفق على نطاق العمل والسعر.\n\n{{booking_line}}\n\n${SIGN_AR}`,
    },
  },
  'meeting-invite': {
    title: 'Answer to a prospect who replied: book a call',
    en: {
      subject: 'Re: a call with Zirr',
      body: `Hello {{name}},\n\nThank you for your reply. The easiest next step is a short call, where I hear what you need and you see the work.\n\n{{booking_line}}\n\n${SIGN_EN}`,
    },
    ar: {
      subject: 'رد: مكالمة مع زِرّ',
      body: `مرحباً {{name}}،\n\nشكراً لردّك. أسهل خطوة تالية مكالمة قصيرة، أسمع فيها ما تحتاجونه وتشاهدون العمل.\n\n{{booking_line}}\n\n${SIGN_AR}`,
    },
  },

  // ---------------------------------------------------------------- Proposals ("proposal")
  proposal: {
    title: 'Proposal email',
    en: {
      subject: 'Proposal {{number}}: {{title}}',
      body: `Hello {{name}},\n\nThank you for the call. Here is the proposal for {{title}}, with the scope and the price: {{total}}.\n\nRead it and accept it here: {{link}}\n\nIt is valid until {{valid_until}}. Reply to this email with any question or change.\n\n${SIGN_EN}`,
    },
    ar: {
      subject: 'عرض السعر {{number}}: {{title}}',
      body: `مرحباً {{name}}،\n\nشكراً على المكالمة. هذا عرض السعر لـ {{title}}، بنطاق العمل والسعر: {{total}}.\n\nاقرأه ووافق عليه من هنا: {{link}}\n\nالعرض ساري حتى {{valid_until}}. ردّ على هذه الرسالة بأي سؤال أو تعديل.\n\n${SIGN_AR}`,
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
      body: `Hello {{name}},\n\nI hope the work is serving you well. If you have a next project in mind, or know someone who needs a Flutter app, I'd be glad to help.\n\n{{booking_line}}\n\n${SIGN_EN}`,
    },
    ar: {
      subject: 'تحية سريعة من زِرّ',
      body: `مرحباً {{name}}،\n\nأتمنى أن يكون العمل مفيداً لكم. إن كان لديكم مشروع قادم، أو تعرفون من يحتاج تطبيق Flutter، يسعدني أن أساعد.\n\n{{booking_line}}\n\n${SIGN_AR}`,
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
} as const;

/** The templates a standing rule may send on its own: fixed wording filled in from the records. */
export const SALES_TEMPLATE_KEYS = Object.keys(SALES_TEMPLATES);
