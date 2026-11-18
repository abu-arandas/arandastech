import type { Locale } from './i18n';

/** One section of a legal page, in both languages. */
export interface LegalSection {
  title: { en: string; ar: string };
  body: { en: string; ar: string }[];
}

export interface LegalPage {
  title: { en: string; ar: string };
  updated: string;
  sections: LegalSection[];
}

/** What the site and the platform keep, why, and for how long. Plain words, both languages. */
export const PRIVACY: LegalPage = {
  title: { en: 'Privacy policy', ar: 'سياسة الخصوصية' },
  updated: '2026-11-19',
  sections: [
    {
      title: { en: 'Who we are', ar: 'من نحن' },
      body: [
        {
          en: 'Zirr is a Flutter and Supabase studio in Amman, Jordan. This policy covers this website and the Zirr platform behind it.',
          ar: 'زِرّ استوديو Flutter وSupabase في عمّان، الأردن. تشمل هذه السياسة هذا الموقع ومنصة زِرّ التي تعمل خلفه.',
        },
      ],
    },
    {
      title: { en: 'What we keep', ar: 'ما نحتفظ به' },
      body: [
        {
          en: 'When you write to us: your name, email, phone if you give it, and your message. When you buy: your name, email, what you bought and the payment result. We never see or keep card numbers; the payment provider handles them.',
          ar: 'عندما تراسلنا: اسمك وبريدك الإلكتروني وهاتفك إن أعطيتنا إياه ورسالتك. عندما تشتري: اسمك وبريدك وما اشتريته ونتيجة الدفع. لا نرى أرقام البطاقات ولا نحتفظ بها، فمزوّد الدفع يتولاها.',
        },
        {
          en: 'To stop abuse, we keep a scrambled (hashed) form of your IP address for a short time to count requests. We use no advertising or tracking cookies.',
          ar: 'لمنع إساءة الاستخدام نحتفظ لوقت قصير بصيغة مشفّرة (hash) من عنوان IP لعدّ الطلبات. لا نستخدم ملفات تعريف ارتباط للإعلانات أو التتبّع.',
        },
      ],
    },
    {
      title: { en: 'How we use it', ar: 'كيف نستخدمها' },
      body: [
        {
          en: 'Only to answer you, deliver what you bought, keep the books and keep the service safe. We do not sell or rent your data.',
          ar: 'فقط للرد عليك، وتسليم ما اشتريته، ومسك الحسابات، وحماية الخدمة. لا نبيع بياناتك ولا نؤجّرها.',
        },
      ],
    },
    {
      title: { en: 'Google user data', ar: 'بيانات مستخدمي Google' },
      body: [
        {
          en: 'The Zirr platform can connect to one Gmail mailbox: the business owner’s own, and only when the owner signs in with Google. It reads new messages so they can be sorted and answered, and sends replies the owner approves. Nobody else’s Google account is used.',
          ar: 'يمكن لمنصة زِرّ الاتصال بصندوق Gmail واحد: صندوق صاحب العمل نفسه، وفقط عندما يسجّل الدخول بحساب Google. تقرأ المنصة الرسائل الجديدة لترتيبها والرد عليها، وترسل الردود التي يوافق عليها صاحب العمل. لا يُستخدم حساب Google لأي شخص آخر.',
        },
        {
          en: 'Zirr’s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. Gmail data is not used for advertising, is not sold, and is not used to train general AI models.',
          ar: 'يلتزم استخدام زِرّ للمعلومات الواردة من واجهات Google البرمجية ونقلها بسياسة بيانات المستخدم لخدمات Google API، بما فيها متطلبات الاستخدام المحدود. لا تُستخدم بيانات Gmail للإعلانات ولا تُباع ولا تُستخدم لتدريب نماذج ذكاء اصطناعي عامة.',
        },
      ],
    },
    {
      title: { en: 'Who else handles it', ar: 'من يتعامل معها أيضاً' },
      body: [
        {
          en: 'Our hosting (Vercel), database (Neon), the payment provider, and the email service that sends receipts. Each gets only what it needs to do its job.',
          ar: 'الاستضافة (Vercel)، وقاعدة البيانات (Neon)، ومزوّد الدفع، وخدمة البريد التي ترسل الإيصالات. كلٌّ منها يحصل فقط على ما يحتاجه لعمله.',
        },
      ],
    },
    {
      title: { en: 'How long we keep it', ar: 'مدة الاحتفاظ' },
      body: [
        {
          en: 'Messages and orders for as long as the law asks us to keep business records. You can ask us to send you a copy of your data or to erase it, and we will, except what the law makes us keep.',
          ar: 'الرسائل والطلبات طوال المدة التي يطلبها القانون لحفظ السجلات التجارية. يمكنك أن تطلب نسخة من بياناتك أو حذفها وسنفعل، إلا ما يُلزمنا القانون بحفظه.',
        },
      ],
    },
    {
      title: { en: 'Contact', ar: 'التواصل' },
      body: [
        {
          en: 'Write to us through the contact page for any privacy question or request.',
          ar: 'راسلنا عبر صفحة التواصل لأي سؤال أو طلب يتعلق بالخصوصية.',
        },
      ],
    },
  ],
};

/** The terms for using the site and buying from it. */
export const TERMS: LegalPage = {
  title: { en: 'Terms of service', ar: 'شروط الخدمة' },
  updated: '2026-11-19',
  sections: [
    {
      title: { en: 'The service', ar: 'الخدمة' },
      body: [
        {
          en: 'This site sells Zirr source-code licences and takes requests for Flutter work. By using it you agree to these terms.',
          ar: 'يبيع هذا الموقع تراخيص الكود المصدري لمنتجات زِرّ ويستقبل طلبات أعمال Flutter. باستخدامك له فإنك توافق على هذه الشروط.',
        },
      ],
    },
    {
      title: { en: 'Licences', ar: 'التراخيص' },
      body: [
        {
          en: 'A licence lets you use and change the source code for the projects it names. It does not let you resell or share the source code itself. The full licence text comes with each download.',
          ar: 'يتيح لك الترخيص استخدام الكود المصدري وتعديله للمشاريع التي يحددها. ولا يتيح لك إعادة بيع الكود المصدري نفسه أو مشاركته. يأتي النص الكامل للترخيص مع كل تنزيل.',
        },
      ],
    },
    {
      title: { en: 'Payments and refunds', ar: 'الدفع والاسترداد' },
      body: [
        {
          en: 'Prices are shown before you pay. If a download does not work as described, write to us within 14 days and we will fix it or refund you.',
          ar: 'تظهر الأسعار قبل الدفع. إذا لم يعمل التنزيل كما هو موصوف، راسلنا خلال 14 يوماً وسنصلحه أو نردّ لك المبلغ.',
        },
      ],
    },
    {
      title: { en: 'Fair use', ar: 'الاستخدام العادل' },
      body: [
        {
          en: 'Do not try to break, overload or misuse the site. We may block requests that do.',
          ar: 'لا تحاول تعطيل الموقع أو إثقاله أو إساءة استخدامه. قد نحجب الطلبات التي تفعل ذلك.',
        },
      ],
    },
    {
      title: { en: 'Liability', ar: 'المسؤولية' },
      body: [
        {
          en: 'The software is provided as described, without other promises. Our liability is limited to what you paid us for the item in question.',
          ar: 'تُقدَّم البرمجيات كما هي موصوفة دون وعود أخرى. تقتصر مسؤوليتنا على ما دفعته لنا مقابل المنتج المعني.',
        },
      ],
    },
    {
      title: { en: 'Law', ar: 'القانون' },
      body: [
        {
          en: 'These terms follow the laws of the Hashemite Kingdom of Jordan. Questions go through the contact page.',
          ar: 'تخضع هذه الشروط لقوانين المملكة الأردنية الهاشمية. ترسَل الأسئلة عبر صفحة التواصل.',
        },
      ],
    },
  ],
};

export const legalText = (text: { en: string; ar: string }, locale: Locale): string => text[locale];
