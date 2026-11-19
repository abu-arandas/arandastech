/// Arabic for the dashboard's hello, its jokes and its fun moments, written to read as Jordanian Arabic rather than a
/// word-for-word copy. Several of these are kept in lists (see Jokes in lib/widgets/fun.dart), which
/// `tool/check_arabic.mjs` cannot see, so check them here when adding a line there.
const arFun = <String, String>{
  // The hello, by the time of day.
  'Good morning': 'صباح الخير',
  'Good afternoon': 'نهارك سعيد',
  'Good evening': 'مساء الخير',
  'Still up?': 'لسّا صاحي؟',
  'Another one': 'وحدة كمان',
  // Jokes.greetings
  'The team is busy. You can have a coffee.': 'الفريق شغّال، وإنت اشرب قهوتك.',
  'No buttons were harmed in the making of this dashboard.': 'ولا زرّ تأذّى وإحنا نعمل هاللوحة.',
  'Your agents write the emails. You do the smiling.': 'الوكلاء بيكتبوا الإيميلات، وإنت عليك الابتسامة.',
  'Every big business started with one button.': 'كل شغل كبير بلّش بزرّ واحد.',
  'Sales are like buttons: one at a time, and then it all holds.': 'المبيعات زي الأزرار: واحد ورا واحد، وبعدين كله بيمسك.',
  'Press the logo five times. Just saying.': 'اضغط الشعار خمس مرات… بس بنحكي.',
  // Jokes.loading
  'Sewing the buttons back on…': 'عم نخيّط الأزرار من جديد…',
  'Waking the team up…': 'عم نصحّي الفريق…',
  'Counting the buttons…': 'عم نعدّ الأزرار…',
  // Today's tiles at zero
  'Quiet. Sales is writing.': 'هدوء… المبيعات عم تكتب.',
  'Nothing on the sewing machine.': 'ما في إشي على ماكينة الخياطة.',
  'Nothing stuck. Lovely.': 'ولا إشي عالق. حلو.',
  'Inbox zero. Frame it.': 'صندوق الوارد فاضي. علّقه على الحيط.',
  'No suspicious mail today.': 'ما في بريد مريب اليوم.',
  'All calm. Suspiciously calm.': 'كله هادي… هدوء مريب.',
  'Tap to see them': 'اضغط لتشوفها',
  // What waits for the owner
  'Go get a coffee. The team has this.': 'روح اشرب قهوة، الفريق ماسك الشغل.',
  'request needs a yes or a no.': 'طلب بستنّى منك نعم أو لا.',
  'requests need a yes or a no.': 'طلبات بتستنّى منك نعم أو لا.',
  'Review approvals': 'راجع الموافقات',
  // The pause card
  'Everything is paused.': 'كل شيء متوقف.',
  'Everything is running.': 'كل شيء شغّال.',
  'Held actions are kept, not dropped.': 'الإجراءات المعلّقة محفوظة ولن تُحذف.',
  'One press stops every agent.': 'ضغطة وحدة بتوقف كل الوكلاء.',
  // Celebrations
  'Goal reached!': 'وصلت الهدف!',
  'You found the secret button!': 'لقيت الزرّ السرّي!',
};
