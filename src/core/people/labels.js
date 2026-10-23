// Every word the people layer shows, in Traditional Chinese (Taiwan).

export const DAY_NAMES = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];

export const STATE_LABELS = {
  HOME: '在家', SLEEPING: '睡覺中', COMMUTE: '移動中', AT_WORK: '工作・上課', LEISURE: '休閒',
  MEDICAL: '看病', SHOPPING: '購物・辦事', DINING: '吃飯'
};

// What someone is doing, by segment activity.
export const ACTIVITY_LABELS = {
  // at home
    sleep: '睡覺', nap: '午睡', 'day-sleep': '補眠', wake: '起床準備', breakfast: '吃早餐', brunch: '吃早午餐',
  'lunch-home': '吃午餐', supper: '吃晚餐', leisure: '在家休息', homework: '寫功課', tv: '看電視', play: '在家玩',
  prep: '備料', 'wind-down': '下班休息', reading: '在家看書', 'family-breakfast': '和家人吃早餐',
  // school and work
  class: '上課', 'school-lunch': '午餐時間', 'school-supper': '吃便當', 'evening-study': '晚自習', study: '讀書',
  lecture: '上課', teaching: '教課', 'lesson-prep': '備課', research: '研究室工作', 'school-office': '處理校務',
  office: '辦公', 'staff-lunch': '午餐', overtime: '加班', 'night-duty': '大夜班值班', labour: '工作', canteen: '員工餐廳吃午餐',
  reception: '顧店', 'staff-meal': '員工餐', driving: '開車', dispatch: '調度車輛', duty: '假日值班', security: '保全巡邏',
  desk: '值班台', patrol: '巡邏', 'school-gate': '護學崗', handover: '交班', counter: '櫃台服務', balancing: '軋帳',
  wholesale: '批發', retail: '顧攤', 'stall-breakfast': '攤位早餐', 'stall-close': '收攤', 'set-up': '準備攤位', stall: '擺攤',
  collection: '收垃圾', transfer: '垃圾轉運', riverfront: '清掃河岸', yard: '場區整理', 'yard-breakfast': '吃早餐',
  'duty-meal': '值班便當', rounds: '巡房看診', nursing: '照護病人', 'hospital-office': '醫院行政', 'clinic-desk': '掛號服務',
  'town-hall': '處理鎮務', inspection: '到鎮上巡視', walkabout: '在鎮上走走',
  'state-affairs': '處理國家大事', helicopter: '搭直升機巡視小鎮',
  preflight: '飛行前簡報', flying: '執勤飛行', turnaround: '過站休息', debrief: '任務後講評', 'ground-ops': '機場勤務',
  'animal-care': '照顧動物', 'fire-duty': '消防待命', drill: '消防演練', 'pump-service': '加油服務', 'cinema-service': '影城服務',
  'temple-service': '打理廟務',
  // in hospital
  treatment: '治療', 'ward-rest': '病房休息', corridor: '走廊散步', 'ward-meal': '病房用餐',
  // out and about
  commute: '在路上', stroll: '散步', stroller: '推車散步', 'morning-exercise': '晨間運動', 'board-games': '下棋打牌',
  'square-dance': '跳廣場舞', 'pick-up': '接孫子放學', 'with-grandkid': '帶孫子去玩', 'after-school': '放學去玩',
  rides: '玩遊樂設施', arcade: '夾娃娃、打電動', playground: '在廣場玩', outing: '出去走走', 'hang-out': '和朋友閒晃',
  sports: '運動', 'library-reading': '在圖書館看書', 'bench-chat': '和老朋友坐著聊天', chess: '和老朋友下棋',
  'family-fun': '全家去玩', 'family-shopping': '全家逛街', 'family-picnic': '全家去走走', 'couple-time': '和另一半出去走走',
  grocery: '買菜', supplies: '採買食材', shopping: '逛街購物', errand: '辦事', pension: '領退休金', 'welfare-queue': '辦就業登記',
  'check-up': '看診',
  'night-snack': '吃晚餐、逛夜市', 'food-court': '在美食街吃飯', date: '約會', 'friends-dinner': '和朋友聚餐',
  'family-dinner': '全家吃晚餐',
  'zoo-visit': '逛動物園', 'family-zoo': '全家逛動物園', movie: '看電影', 'movie-date': '和另一半看電影', 'family-movie': '全家看電影',
  worship: '到廟裡拜拜', 'plane-spotting': '到機場看飛機', refuel: '加油',
  // dogs on a lead, and the kindergarten inside the primary school
  'dog-walk': '遛狗', kindergarten: '上幼兒園', 'drop-off': '送小孩上學', 'pick-up-kid': '接小孩放學', 'after-care': '幼兒園課後照顧',
  // the strays
  'nest-sleep': '窩裡睡覺', doze: '打盹', sunbathe: '曬太陽', prowl: '到處閒晃', 'beg-food': '討食', fed: '被餵飯', 'play-kids': '跟小朋友玩', 'patrol-turf': '巡視地盤', 'wait-door': '在門口等人'
};

// What one person is to another, on the first person's page. Neutral words: residents
// go by an account-style handle only, so nothing here guesses anyone's gender.
export const RELATION_LABELS = {
  fiancee: '未婚妻', fiance: '訂婚對象', partner: '另一半', 'old-partner': '老伴', parent: '父母', child: '子女',
  sibling: '兄弟姊妹', grandparent: '祖父母', grandchild: '孫子女', roommate: '室友', friend: '好朋友',
  'old-friend': '老朋友', classmate: '同學', coworker: '同事', caretaker: '照顧的毛孩', 'cared-by': '照顧牠的人'
};
// The order relations are listed in: family first, then friends, then work.
export const RELATION_ORDER = ['fiancee', 'fiance', 'partner', 'old-partner', 'parent', 'child', 'sibling', 'grandparent',
  'grandchild', 'caretaker', 'cared-by', 'roommate', 'friend', 'old-friend', 'classmate', 'coworker'];
export const RELATION_GROUP = {
  fiancee: 'family', fiance: 'family', partner: 'family', 'old-partner': 'family', parent: 'family', child: 'family',
  sibling: 'family', grandparent: 'family', grandchild: 'family', roommate: 'friends', friend: 'friends',
  'old-friend': 'friends', classmate: 'friends', coworker: 'work', caretaker: 'friends', 'cared-by': 'friends'
};
// A link [a, b] of this kind reads the other way round from b's side.
export const RELATION_INVERSE = { parent: 'child', grandparent: 'grandchild', fiancee: 'fiance', caretaker: 'cared-by' };

// Who someone is, for people without a job: the info sheet says 身分 instead of 職業.
export const STATUS_ROLES = new Set(['preschooler', 'student-p', 'student-m', 'student-u', 'unemployed', 'patient', 'retiree', 'senior', 'stray']);
export const STUDENT_ROLES = new Set(['student-p', 'student-m', 'student-u']);
