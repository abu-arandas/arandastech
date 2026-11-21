import type { Guide, GuideProduct, L } from './guides';

/** The words of every search page. Facts only from the products' documentation; prices as listed for sale. */

const t = (en: string, ar: string): L => ({ en, ar });

const LINKS = {
  retailShop: 'https://erp-house.vercel.app',
  retailBuy: 'https://5702823643035.gumroad.com/l/zirr-retail',
  video: 'https://youtu.be/qNjJJJ7v6oE',
  pos: 'https://pos-sage-one.vercel.app',
  boutique: 'https://vanguard-demo-sigma.vercel.app',
  whatsapp: 'https://wa.me/962791568798',
};

const label = {
  tryShop: t('Try the live shop', 'جرّب المتجر الحي'),
  buyRetail: t('Buy Zirr Retail from $79', 'اشترِ زِرّ للتجزئة من 79 دولاراً'),
  video: t('Watch the 4-minute tour', 'شاهد الجولة في 4 دقائق'),
  tryPos: t('Open Zirr POS in your browser', 'افتح زِرّ كاشير في متصفحك'),
  posTrial: t('Ask for the 14-day free trial', 'اطلب التجربة المجانية 14 يوماً'),
  whatsapp: t('Message us on WhatsApp', 'راسلنا على واتساب'),
  quote: t('Ask for a quote', 'اطلب عرض سعر'),
  compare: t('Compare the products', 'قارن بين المنتجات'),
  boutique: t('See the boutique shop', 'شاهد متجر البوتيك'),
};

const RETAIL: GuideProduct = { name: 'Zirr Retail', os: 'Web, Android, iPadOS, Windows', price: '79', currency: 'USD' };
const POS: GuideProduct = { name: 'Zirr POS', os: 'Windows, Web', price: '299', currency: 'JOD' };

const retailLinks = [
  { href: LINKS.retailShop, label: label.tryShop },
  { href: LINKS.retailBuy, label: label.buyRetail },
  { href: LINKS.video, label: label.video },
];
const posLinks = [
  { href: '/trial', label: label.posTrial },
  { href: LINKS.pos, label: label.tryPos },
  { href: LINKS.whatsapp, label: label.whatsapp },
];

/** What every Zirr Retail page can say about the code itself. */
const handOver = {
  heading: t('Built to be handed over', 'مبني ليُسلَّم'),
  body: [
    t(
      'Zero flutter analyze issues, row-level security on every table proved by SQL checks, and a one-file rebrand for the name, colours and pages. Documentation comes as HTML and PDF.',
      'صفر ملاحظات من flutter analyze، وأمان على مستوى الصفوف في كل جدول تثبته فحوص SQL، وتغيير العلامة من ملف واحد للاسم والألوان والصفحات. والتوثيق بصيغتي HTML وPDF.',
    ),
  ],
};

export const GUIDES: Guide[] = [
  {
    slug: 'jofotara-pos-jordan',
    product: RETAIL,
    title: t('A point of sale with JoFotara e-invoicing for Jordan', 'نقطة بيع مع الفوترة الإلكترونية جوفوترا للأردن'),
    description: t(
      'Zirr Retail is a Flutter shop, till and back office with JoFotara e-invoicing ready to connect. Arabic and English, from $79.',
      'زِرّ للتجزئة متجر ونقطة بيع ولوحة إدارة بـ Flutter، مع الفوترة الإلكترونية جوفوترا جاهزة للربط. عربي وإنجليزي، من 79 دولاراً.',
    ),
    intro: t(
      'Shops in Jordan must send their invoices to JoFotara, the national e-invoicing system. Zirr Retail sends each sale once, prints a bilingual receipt and keeps the result with the invoice.',
      'على المحلات في الأردن إرسال فواتيرها إلى جوفوترا، نظام الفوترة الإلكترونية الوطني. يرسل زِرّ للتجزئة كل عملية بيع مرة واحدة، ويطبع إيصالاً باللغتين، ويحفظ النتيجة مع الفاتورة.',
    ),
    sections: [
      {
        heading: t('How it works', 'كيف يعمل'),
        body: [
          t(
            'A Supabase Edge Function talks to JoFotara with your own keys. Each invoice is sent once, even when the till retries, so the tax office never sees the same sale twice.',
            'دالة Edge في Supabase تتصل بجوفوترا بمفاتيحك الخاصة. تُرسل كل فاتورة مرة واحدة حتى لو أعاد الجهاز المحاولة، فلا ترى دائرة الضريبة البيع نفسه مرتين.',
          ),
        ],
        points: [
          t('Bilingual receipt, Arabic and English', 'إيصال باللغتين العربية والإنجليزية'),
          t('Returns with or without the original receipt', 'مرتجعات مع الإيصال الأصلي أو بدونه'),
          t(
            'Test mode first, live mode when your keys are ready',
            'وضع تجريبي أولاً، ثم الوضع الحقيقي عند جاهزية مفاتيحك',
          ),
        ],
      },
      {
        heading: t('More than a till', 'أكثر من نقطة بيع'),
        body: [
          t(
            'The same project holds the online shop and the back office, so stock, customers and books stay in one place.',
            'المشروع نفسه يضم المتجر الإلكتروني ولوحة الإدارة، فيبقى المخزون والعملاء والحسابات في مكان واحد.',
          ),
        ],
      },
      handOver,
    ],
    links: retailLinks,
  },
  {
    slug: 'flutter-pos-source-code',
    product: RETAIL,
    title: t('Flutter POS source code on Supabase', 'كود مصدري لنقطة بيع Flutter على Supabase'),
    description: t(
      'Full Flutter source for a point of sale with barcodes, sizes, split payments, offline sales and ESC/POS printing. Web, Android, iPad and Windows.',
      'كود Flutter كامل لنقطة بيع بالباركود والمقاسات والدفع المقسّم والبيع دون اتصال وطباعة ESC/POS. ويب وأندرويد وآيباد وويندوز.',
    ),
    intro: t(
      'Zirr Retail’s till is written in Flutter on Supabase. You get the whole source, the database schema and the documentation, and you run it under your own name.',
      'نقطة البيع في زِرّ للتجزئة مكتوبة بـ Flutter على Supabase. تحصل على الكود كاملاً ومخطط قاعدة البيانات والتوثيق، وتشغّله باسمك.',
    ),
    sections: [
      {
        heading: t('At the till', 'عند الصندوق'),
        body: [
          t('Everything a shop counter needs, in Arabic and English.', 'كل ما يحتاجه صندوق المحل، بالعربي والإنجليزي.'),
        ],
        points: [
          t('Barcode scanning, sizes and colours', 'مسح الباركود والمقاسات والألوان'),
          t('Discounts, coupons, split payments and returns', 'خصومات وقسائم ودفع مقسّم ومرتجعات'),
          t(
            'Tills opened and closed with a counted float, one till per device',
            'فتح الصندوق وإغلاقه مع عدّ النقد، وصندوق لكل جهاز',
          ),
          t(
            'ESC/POS receipt printers, 80 or 58 mm, Arabic included, from Android',
            'طابعات إيصالات ESC/POS بعرض 80 أو 58 مم، مع العربية، من أندرويد',
          ),
        ],
      },
      {
        heading: t('What you need', 'ما تحتاجه'),
        body: [
          t(
            'Flutter 3.50 or newer and a Supabase account; the free plan works. Payment, email and e-invoicing keys are optional and opened in your own name.',
            'Flutter 3.50 أو أحدث وحساب Supabase، والخطة المجانية تكفي. مفاتيح الدفع والبريد والفوترة اختيارية وتفتحها باسمك.',
          ),
        ],
      },
      handOver,
    ],
    links: retailLinks,
  },
  {
    slug: 'flutter-ecommerce-admin-source-code',
    product: RETAIL,
    title: t('Flutter online shop and admin panel, full source', 'متجر إلكتروني ولوحة إدارة بـ Flutter، الكود كاملاً'),
    description: t(
      'A Flutter and Supabase online shop with a back office: catalogue, checkout, card payments, order emails, stock and books. Arabic and English.',
      'متجر إلكتروني بـ Flutter وSupabase مع لوحة إدارة: كتالوج ودفع وبطاقات ورسائل الطلبات والمخزون والحسابات. عربي وإنجليزي.',
    ),
    intro: t(
      'Zirr Retail is one Flutter project for a whole retail business: the online shop, the point of sale and the back office share one stock ledger, one set of customers and one set of books.',
      'زِرّ للتجزئة مشروع Flutter واحد لتجارة تجزئة كاملة: المتجر الإلكتروني ونقطة البيع ولوحة الإدارة تتشارك سجل مخزون واحداً وقائمة عملاء واحدة ودفاتر حسابات واحدة.',
    ),
    sections: [
      {
        heading: t('The shop', 'المتجر'),
        body: [t('What your customers see.', 'ما يراه عملاؤك.')],
        points: [
          t('Home page built from sections staff edit', 'صفحة رئيسية من أقسام يعدّلها الموظفون'),
          t('Catalogue with filters and search, live stock per size', 'كتالوج بفلاتر وبحث، ومخزون حي لكل مقاس'),
          t(
            'Promo codes, delivery or click and collect, guest order tracking',
            'رموز خصم، توصيل أو استلام من المحل، وتتبع الطلب دون حساب',
          ),
          t('Order emails in English and Arabic', 'رسائل الطلبات بالإنجليزية والعربية'),
        ],
      },
      {
        heading: t('The back office', 'لوحة الإدارة'),
        body: [t('What your staff use.', 'ما يستخدمه موظفوك.')],
        points: [
          t(
            'Products and variants, stock transfers, counts and purchasing',
            'المنتجات والأصناف، نقل المخزون والجرد والمشتريات',
          ),
          t(
            'Profit and loss by channel, expenses, supplier bills, double-entry books',
            'الأرباح والخسائر لكل قناة، المصاريف، فواتير الموردين، قيد مزدوج',
          ),
          t('43 permissions, store-scoped access and an audit trail', '43 صلاحية، ووصول مقيّد بالفرع، وسجل تدقيق'),
        ],
      },
      handOver,
    ],
    links: retailLinks,
  },
  {
    slug: 'offline-pos-for-shops',
    title: t('A point of sale that keeps selling offline', 'نقطة بيع تواصل البيع دون إنترنت'),
    description: t(
      'When the internet drops, Zirr’s tills keep selling and save every sale once the connection is back. Two products, both offline first.',
      'عندما ينقطع الإنترنت تواصل صناديق زِرّ البيع وتحفظ كل عملية عند عودة الاتصال. منتجان، وكلاهما يعمل دون اتصال أولاً.',
    ),
    intro: t(
      'A shop cannot stop selling because the line is down. Both Zirr tills write each sale on the device first and send it when the network returns.',
      'لا يستطيع المحل التوقف عن البيع لأن الخط انقطع. كلا صندوقي زِرّ يكتبان كل عملية على الجهاز أولاً ويرسلانها عند عودة الشبكة.',
    ),
    sections: [
      {
        heading: t('Zirr POS, for one shop or café', 'زِرّ كاشير، لمحل أو مقهى'),
        body: [
          t(
            'A Windows desktop app that also runs in a browser. Every sale is committed locally before anything touches the network; Supabase sync is optional for several terminals.',
            'تطبيق ويندوز يعمل أيضاً في المتصفح. تُحفظ كل عملية محلياً قبل أي اتصال بالشبكة، والمزامنة مع Supabase اختيارية لعدة أجهزة.',
          ),
        ],
      },
      {
        heading: t('Zirr Retail, for a shop with an online store', 'زِرّ للتجزئة، لمحل مع متجر إلكتروني'),
        body: [
          t(
            'The Flutter till keeps selling offline and saves the sales when the connection is back, into the same stock the online shop uses.',
            'صندوق Flutter يواصل البيع دون اتصال ويحفظ العمليات عند عودة الاتصال، في المخزون نفسه الذي يستخدمه المتجر الإلكتروني.',
          ),
        ],
      },
    ],
    links: [{ href: '/guides/compare', label: label.compare }, ...posLinks.slice(0, 2)],
  },
  {
    slug: 'cafe-restaurant-pos-amman',
    product: POS,
    title: t('A POS for cafés and small restaurants in Amman', 'نظام كاشير للمقاهي والمطاعم الصغيرة في عمّان'),
    description: t(
      'Zirr POS with tables, kitchen display and a QR menu, in Arabic and English. Installed on your PC, 14-day free trial, then 299 JOD once.',
      'زِرّ كاشير مع الطاولات وشاشة المطبخ وقائمة QR، بالعربي والإنجليزي. نركّبه على جهازك، تجربة مجانية 14 يوماً، ثم 299 ديناراً مرة واحدة.',
    ),
    intro: t(
      'We install Zirr POS on your PC, set up your menu in Arabic and English, connect your receipt printer and train your staff. There is no monthly fee.',
      'نركّب زِرّ كاشير على جهازك، ونجهّز قائمتك بالعربي والإنجليزي، ونربط طابعة الإيصالات، وندرّب موظفيك. ولا توجد رسوم شهرية.',
    ),
    sections: [
      {
        heading: t('For the floor and the kitchen', 'للصالة والمطبخ'),
        body: [t('Restaurant modules you switch on in Settings.', 'وحدات المطاعم تفعّلها من الإعدادات.')],
        points: [
          t(
            'Table plan with open tabs that settle once at the end',
            'مخطط طاولات مع حسابات مفتوحة تُسدَّد مرة واحدة في النهاية',
          ),
          t('Kitchen display with tickets per station and timers', 'شاشة مطبخ بتذاكر لكل قسم ومؤقتات'),
          t('QR menu served to the customer’s phone', 'قائمة QR تظهر على هاتف الزبون'),
          t('Item modifiers, like no sugar or extra shot', 'إضافات على الأصناف، مثل بدون سكر أو شوت إضافي'),
        ],
      },
      {
        heading: t('What it costs', 'كم يكلّف'),
        body: [
          t(
            '14 days free, then 299 JOD one-off with 3 months of WhatsApp support.',
            '14 يوماً مجاناً، ثم 299 ديناراً مرة واحدة مع 3 أشهر دعم على واتساب.',
          ),
        ],
      },
    ],
    links: posLinks,
  },
  {
    slug: 'arabic-english-shop-app',
    product: RETAIL,
    title: t(
      'An Arabic and English shop app, right to left done properly',
      'تطبيق متجر بالعربي والإنجليزي، باتجاه صحيح من اليمين لليسار',
    ),
    description: t(
      'Zirr Retail mirrors every screen for Arabic, prints Arabic receipts and emails customers in both languages. Flutter source from $79.',
      'زِرّ للتجزئة يعكس كل شاشة للعربية، ويطبع إيصالات عربية، ويراسل العملاء باللغتين. كود Flutter من 79 دولاراً.',
    ),
    intro: t(
      'Many shop templates add Arabic as a translation file and stop there. Zirr Retail is checked for right-to-left layouts and missing Arabic texts on every change.',
      'كثير من قوالب المتاجر تضيف العربية كملف ترجمة وتتوقف. أما زِرّ للتجزئة فيُفحص اتجاه الشاشات ونقص النصوص العربية مع كل تعديل.',
    ),
    sections: [
      {
        heading: t('Arabic everywhere a customer looks', 'العربية في كل مكان ينظر إليه العميل'),
        body: [t('Not only the screens.', 'ليس الشاشات فقط.')],
        points: [
          t('Every screen mirrored, light and dark', 'كل شاشة معكوسة، بالوضعين الفاتح والداكن'),
          t('Receipts printed in Arabic on 80 or 58 mm printers', 'إيصالات مطبوعة بالعربية على طابعات 80 أو 58 مم'),
          t('Order emails in Arabic and English', 'رسائل الطلبات بالعربية والإنجليزية'),
          t(
            'Product text written in both languages by the optional AI assistant',
            'نصوص المنتجات باللغتين عبر المساعد الذكي الاختياري',
          ),
        ],
      },
      handOver,
    ],
    links: retailLinks,
  },
  {
    slug: 'fashion-boutique-shop-app',
    title: t(
      'A shop app for fashion boutiques: sizes, colours and stock',
      'تطبيق متجر لبوتيكات الأزياء: المقاسات والألوان والمخزون',
    ),
    description: t(
      'Sell clothes online with stock per size and colour, promotions and a back office. Zirr Retail and Zirr Boutique, both Flutter on Supabase.',
      'بِع الملابس أونلاين بمخزون لكل مقاس ولون، مع العروض ولوحة إدارة. زِرّ للتجزئة وزِرّ بوتيك، وكلاهما Flutter على Supabase.',
    ),
    intro: t(
      'Clothes are hard to sell online: one dress is ten items once sizes and colours count. Both Zirr shop apps keep stock for each size and colour.',
      'بيع الملابس أونلاين صعب: الفستان الواحد يصبح عشرة أصناف عند احتساب المقاسات والألوان. كلا تطبيقي زِرّ يحفظان المخزون لكل مقاس ولون.',
    ),
    sections: [
      {
        heading: t('Zirr Retail', 'زِرّ للتجزئة'),
        body: [
          t(
            'Shop, till and back office together, with colours set per size, tailoring at the till and stock transfers between branches.',
            'متجر وصندوق ولوحة إدارة معاً، مع ألوان محددة لكل مقاس، وخدمة التعديل عند الصندوق، ونقل المخزون بين الفروع.',
          ),
        ],
      },
      {
        heading: t('Zirr Boutique', 'زِرّ بوتيك'),
        body: [
          t(
            'An editorial Flutter Web storefront for premium apparel, with nested product variants and a promotions engine. We set it up for you.',
            'واجهة متجر Flutter Web بأسلوب المجلات للأزياء الراقية، مع أصناف متداخلة ومحرّك عروض. نجهّزه لك.',
          ),
        ],
      },
    ],
    links: [
      { href: LINKS.retailShop, label: label.tryShop },
      { href: LINKS.boutique, label: label.boutique },
      { href: '/contact?package=done-for-you-store', label: label.quote },
    ],
  },
  {
    slug: 'paytabs-flutter-checkout',
    product: RETAIL,
    title: t('PayTabs card payments in a Flutter shop', 'الدفع بالبطاقات عبر PayTabs في متجر Flutter'),
    description: t(
      'Zirr Retail takes cards on PayTabs’ hosted page in Jordan, the UAE, Saudi Arabia, Oman and Egypt, and the server checks every amount.',
      'زِرّ للتجزئة يقبل البطاقات على صفحة PayTabs المستضافة في الأردن والإمارات والسعودية وعُمان ومصر، والخادم يتحقق من كل مبلغ.',
    ),
    intro: t(
      'Card numbers never touch your app: customers pay on PayTabs’ own page, and a Supabase Edge Function confirms the payment before the order counts.',
      'أرقام البطاقات لا تمر بتطبيقك أبداً: يدفع العميل على صفحة PayTabs نفسها، ودالة Edge في Supabase تؤكد الدفع قبل اعتماد الطلب.',
    ),
    sections: [
      {
        heading: t('Safe by design', 'آمن من الأساس'),
        body: [
          t(
            'The server counts the money, not the phone: prices, coupons and gift cards are checked again on the server before PayTabs is asked for the amount.',
            'الخادم هو من يحسب المبلغ وليس الهاتف: الأسعار والقسائم وبطاقات الهدايا تُفحص مرة أخرى على الخادم قبل طلب المبلغ من PayTabs.',
          ),
        ],
        points: [
          t(
            'Cash on delivery, gift cards, store credit and loyalty points too',
            'والدفع عند الاستلام وبطاقات الهدايا ورصيد المتجر ونقاط الولاء أيضاً',
          ),
          t('Your own PayTabs profile and keys', 'ملف PayTabs ومفاتيحك الخاصة'),
        ],
      },
      handOver,
    ],
    links: retailLinks,
  },
  {
    slug: 'flutter-developers-for-agencies',
    title: t('Flutter and Supabase developers for your agency', 'مطوّرو Flutter وSupabase لوكالتك'),
    description: t(
      'A studio in Amman that builds Arabic and English Flutter apps under your agency’s name: fixed projects, a monthly team, or a rescue of an app in trouble.',
      'استوديو في عمّان يبني تطبيقات Flutter بالعربي والإنجليزي باسم وكالتك: مشاريع محددة، أو فريق شهري، أو إنقاذ تطبيق متعثر.',
    ),
    intro: t(
      'You keep the client; we build the app. Every Zirr project starts from the same template, so the code you hand over is tidy and your next developer can read it.',
      'العميل يبقى لك ونحن نبني التطبيق. كل مشروع في زِرّ يبدأ من القالب نفسه، فيكون الكود الذي تسلّمه مرتباً ويقرؤه أي مطوّر بعدك.',
    ),
    sections: [
      {
        heading: t('What every app gets', 'ما يحصل عليه كل تطبيق'),
        body: [t('From the Zirr Starter template.', 'من قالب زِرّ الأساسي.')],
        points: [
          t('Arabic first, English too, with right-to-left mirroring', 'العربية أولاً والإنجليزية أيضاً، مع عكس الاتجاه'),
          t('Row-level security on every table, with SQL tests', 'أمان على مستوى الصفوف في كل جدول، مع اختبارات SQL'),
          t(
            'Zero flutter analyze issues and checks on every change',
            'صفر ملاحظات من flutter analyze وفحوص مع كل تعديل',
          ),
          t('A one-file rebrand to your client’s name and colours', 'تغيير العلامة إلى اسم عميلك وألوانه من ملف واحد'),
        ],
      },
    ],
    links: [
      { href: '/contact?package=project', label: label.quote },
      { href: '/contact?package=review-and-rescue', label: t('Get a code review', 'اطلب مراجعة للكود') },
    ],
  },
  {
    slug: 'set-up-zirr-retail',
    product: RETAIL,
    title: t('How to set up Zirr Retail in an afternoon', 'كيف تجهّز زِرّ للتجزئة في فترة بعد الظهر'),
    description: t(
      'From the download to a running shop: open the documentation, run the app, connect your own Supabase project, then add your keys when you need them.',
      'من التنزيل إلى متجر يعمل: افتح التوثيق، شغّل التطبيق، اربط مشروع Supabase الخاص بك، ثم أضف مفاتيحك عند الحاجة.',
    ),
    intro: t(
      'The 4-minute video tour shows the shop, the till and the back office. These are the steps after you buy.',
      'جولة الفيديو في 4 دقائق تعرض المتجر والصندوق ولوحة الإدارة. وهذه هي الخطوات بعد الشراء.',
    ),
    sections: [
      {
        heading: t('The steps', 'الخطوات'),
        body: [
          t(
            'Each step has its own section in Documentation/index.html.',
            'لكل خطوة قسم خاص في Documentation/index.html.',
          ),
        ],
        points: [
          t('Open Documentation/index.html inside the ZIP', 'افتح Documentation/index.html داخل الملف المضغوط'),
          t('Section 3 runs the whole app on your machine', 'القسم 3 يشغّل التطبيق كاملاً على جهازك'),
          t(
            'Section 4 connects your own Supabase project; the free plan works',
            'القسم 4 يربط مشروع Supabase الخاص بك، والخطة المجانية تكفي',
          ),
          t(
            'Add PayTabs, email, JoFotara or AI keys later, in your own name',
            'أضف مفاتيح PayTabs أو البريد أو جوفوترا أو الذكاء الاصطناعي لاحقاً باسمك',
          ),
        ],
      },
      {
        heading: t('Stuck?', 'تعثّرت؟'),
        body: [
          t(
            'Bug fixes are covered for 6 months. Write on WhatsApp with your licence key.',
            'إصلاح الأخطاء مشمول لمدة 6 أشهر. راسلنا على واتساب مع مفتاح الترخيص.',
          ),
        ],
      },
    ],
    links: [
      { href: LINKS.video, label: label.video },
      { href: LINKS.whatsapp, label: label.whatsapp },
      retailLinks[1]!,
    ],
  },
  {
    slug: 'compare',
    title: t('Zirr Retail, Zirr POS or a custom build?', 'زِرّ للتجزئة أم زِرّ كاشير أم تطبيق مخصص؟'),
    description: t(
      'Which Zirr product fits your shop: the Flutter source to run yourself, an installed till for a café, or an app we build for you.',
      'أي منتج من زِرّ يناسب محلك: كود Flutter لتشغّله بنفسك، أو صندوق مركّب لمقهى، أو تطبيق نبنيه لك.',
    ),
    intro: t('Three ways to start, side by side.', 'ثلاث طرق للبدء، جنباً إلى جنب.'),
    sections: [],
    table: {
      head: [t('', ''), t('Zirr Retail', 'زِرّ للتجزئة'), t('Zirr POS', 'زِرّ كاشير'), t('Custom build', 'تطبيق مخصص')],
      rows: [
        [
          t('Best for', 'الأنسب لـ'),
          t('Developers and agencies', 'المطوّرين والوكالات'),
          t('One shop or café', 'محل أو مقهى واحد'),
          t('Agencies with a client', 'وكالات لديها عميل'),
        ],
        [
          t('You get', 'تحصل على'),
          t('Full Flutter source', 'كود Flutter كاملاً'),
          t('Installed app and training', 'تطبيق مركّب وتدريب'),
          t('An app under your name', 'تطبيق باسمك'),
        ],
        [t('Online shop', 'متجر إلكتروني'), t('Yes', 'نعم'), t('No', 'لا'), t('If you need it', 'إن احتجته')],
        [t('Works offline', 'يعمل دون اتصال'), t('Yes', 'نعم'), t('Yes', 'نعم'), t('If you need it', 'إن احتجته')],
        [
          t('JoFotara', 'جوفوترا'),
          t('Ready to connect', 'جاهز للربط'),
          t('No', 'لا'),
          t('If you need it', 'إن احتجته'),
        ],
        [
          t('Price', 'السعر'),
          t('From $79', 'من 79 دولاراً'),
          t('299 JOD once', '299 ديناراً مرة واحدة'),
          t('Quote', 'عرض سعر'),
        ],
      ],
    },
    links: [
      { href: LINKS.retailBuy, label: label.buyRetail },
      { href: '/trial', label: label.posTrial },
      { href: '/contact?package=project', label: label.quote },
    ],
  },
];
