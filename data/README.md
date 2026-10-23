# 資料說明：怎麼改居民、關係、工作與行程

小鎮裡所有「可以手改」的東西都放在 `data/`。改完之後執行：

```
npm run check            # 即 node tools/check-data.mjs
node tools/check-data.mjs --plans   # 另外把每位居民 28 天的行程都跑一遍
```

檢查會用繁體中文告訴你哪位居民、哪個欄位有問題；有錯誤時以代碼 1 結束。

| 檔案 | 內容 |
|---|---|
| `town.js` | 地圖：道路、河、`lots`（地塊放哪棟建築）、夜市、直升機班次 |
| `buildings.js` | 每個地點：名稱、種類 `kind`、容量、開放時間 |
| `residents.json` | 居民，一人一行 |
| `relations.json` | 家戶、關係、接送、好朋友群、老朋友圈 |
| `occupations.json` | 職業類別（顯示順序與名稱） |
| `profiles.json` | 每位居民的簡介，以居民 `id` 為鍵 |

## 居民（residents.json）

```json
{"id":"office-012","name":"bear_clover87","age":25,"role":"office","job":"會計師","family":"firm","org":"誠信會計師事務所","home":"h-point","work":"t-four","hangout":"c-plaza","birthMonth":10}
```

- `id`：固定不變的鍵，關係與簡介都靠它。**改 id 要連 relations.json、profiles.json 一起改。**
- `role` 決定一天怎麼過：`preschooler student-p student-m student-u office worker shopkeeper driver teacher school-admin medical-doc medical-nurse hosp-admin officer clerk sanitation unemployed patient retiree senior`。
- `home`、`work`、`hangout` 都是 `buildings.js` 的地點 id（`work` 沒有就寫 `null`）。
- `family` 是 `occupations.json` 裡的類別 id；`job` 是職稱；`org` 是任職單位（可省略）。
- `preschooler`（學齡前）的 `work` 填 `c-primary`：他們上鎮東國小附設的幼兒園，平日由家長送去、接回（見下面「幼兒園」）。
- 選填：
  - `dog`：養狗的人填狗的名字（例如 `"dog":"豆豆"`）。這個人每天會有一兩次 20～40 分鐘的遛狗（活動 `dog-walk`），資訊頁多一行「養狗」。
  - `schedule`：`mayor`（鎮長）、`president`（總統）、`transit-driver`（公車司機，配 `crew`）、`office-night`（大樓夜班）。
  - `shift`：醫師、護理師、警察用 `early|evening|night`；清潔隊 `dawn|evening`；市場工人 `dawn|morning`。
  - `post`：早班警察 `desk|gate`（`gate` 會在上學日最後 45 分鐘站護學崗）。
  - `crew`：公車司機 `early|late`。
  - `restDays`：休假的星期，0 = 週一 … 6 = 週日；沒寫就依職業自動輪休。
  - `birthMonth`：生日月份。

### 新增一位居民

1. 在 `residents.json` 加一行（保持一人一行），`id` 不可重複，`home` 要有空位（住家容量看 `buildings.js` 的 `capacity`，檢查會顯示「住家人數／容量」）。
2. 在 `relations.json` 的 `households` 讓他加入某個家戶（或新增一戶）。
3. （選填）在 `profiles.json` 加簡介。
4. 執行 `npm run check`。

### 移除一位居民

刪掉那一行，並把他的 id 從 `relations.json`（households、links、pickUps、friendGroups、circles）與 `profiles.json` 拿掉；檢查會提醒你漏掉的地方。

### 換工作、搬家、換工作地點

- 換工作：改 `role`、`job`、`family`、`org`、`work`（`work` 的地點種類要合理：辦公室在 `tower`，學生在學校，醫護在 `hospital`……，檢查會指出不合理的組合）。
- 搬家：改 `home`。同一戶的人應該住在同一處。
- 換班別或休假：改 `shift`、`restDays`。

## 流浪貓、流浪狗（role: stray）

小鎮有一隻流浪貓和一隻流浪狗，算是居民，但不進任何建築：

```json
{"id":"stray-cat","name":"橘子","age":3,"role":"stray","species":"cat","job":"流浪貓","family":"stray","home":"nest:cat","work":null,"birthMonth":5}
```

- `role` 是 `stray`，`species` 是 `cat` 或 `dog`，`family` 是 `stray`（occupations.json 裡的「流浪動物」）。
- `home` 是窩的編號，寫成 `nest:cat`、`nest:dog`，要和 `town.js` 的 `strays` 對得上（`strays` 的 `site` 決定窩在哪個地點旁；現在兩個窩都在鎮公所前的河岸）。`work` 要是 `null`。
- 牠們不進建築，只在窩、街上、店門口、長椅、公園、廣場和夜市之間走動：貓是夜貓子，白天在窩裡睡覺、曬太陽，傍晚走去夜市討食、被攤販餵（`beg-food`、`fed`），夜裡在鎮上四處遊蕩（`prowl`），凌晨兩三點才走回窩；狗清晨到最近的公園或廣場等晨運的長輩餵早餐，白天在鎮上閒晃、打盹（`doze`），放學時間到校門口、遊樂園或廣場跟小朋友玩（`play-kids`），晚上九點半回窩。路太遠（走路超過約兩個小時）就不去。時間寫在 `src/core/people/schedules/strays.js`，遊蕩路線在 `wander.js`。
- 資訊頁只顯示「身分」和「窩」，沒有班別和休假。
- 要新增一隻：在 residents.json 加一行（`id`、`home` 都要新的），在 `town.js` 的 `strays` 加一個窩，並在 `strays.js` 補牠的作息。

### 照顧牠們的人（links.caretaker）

```json
"caretaker": [["shopkeeper-051", "stray-cat"], ["retiree-004", "stray-dog"]]
```

`[照顧的人, 流浪動物]`，每隻 6～10 位：攤販、長輩、學生、鎮長都可以。從人的那邊看是「照顧的毛孩」，從動物那邊看是「照顧牠的人」。第一個一定是居民，第二個一定是流浪動物。

## 幼兒園（附設在鎮東國小）

學齡前兒童平日去 `c-primary` 的附設幼兒園（活動 `kindergarten`，約 07:50 到 16:00；家長晚點來接就多一段 `after-care`）：

- 同一戶裡第一位「上班而且是辦公室、工坊、物流、銀行、公所、醫院行政」的大人順路送小孩（`drop-off`），小孩和大人走同一段路（同一個 `party`），大人晚上下班再順路接回來（`pick-up-kid`）。
- 沒有這樣的大人時，由當天不用上班的大人或祖父母送、接。
- 週末沒有幼兒園，推車散步等活動都排在週末。

## 關係（relations.json）

- `households`：`{"id":"hh-1","kind":"couple|single|elders|flat","adults":[...],"kids":[...],"grandparents":[...]}`。`kids` 要比 `adults` 年輕；同戶成員住同一處（`grandparents` 不一定同住）。
- `links`：成對的關係，格式 `[a, b]`：
  - `partner`、`old-partner`（老伴）、`sibling`、`roommate`、`friend`、`old-friend`、`classmate`、`coworker`：雙向，順序不拘。
  - `parent`：`[孩子, 父母]`；`grandparent`：`[孫子女, 祖父母]`。
  - `caretaker`：`[照顧的人, 流浪動物]`，見上面「照顧牠們的人」。
  - `fiancee`：`[鎮長, 未婚妻]`，兩人週一、三、五晚上約會，週末整天一起。
- `pickUps`：`[祖父母, 小學生]`，上學日放學前到校門口等，帶孩子一起回家（孩子去遊樂園就一起去）。
- `friendGroups`：好朋友群，每三個週五有兩個週五一起吃晚餐。
- `circles`：老朋友圈，每週五個下午坐在附近的長椅上聊天。

新增關係就是在對應陣列加一組 id；介面上的稱呼（另一半、父母、同事……）是自動產生的，不會猜任何人的性別。

## 工作與行程

行程不是逐人手寫，而是「職業 → 日程範本」：

- 各種日程範本在 `src/core/people/schedules/`，每個家族一個檔：`students.js`、`work.js`（上班族、店員、老師……）、`shifts.js`（輪班、司機、病人）、`elders.js`、`leisure.js`（休假日）、`civic.js`（鎮長、總統）。
- 每一列是 `[開始, 結束, 狀態, 地點代號, 活動]`，例如 `['08:00','12:00','AT_WORK','WORK','class']`。地點代號如 `HOME`、`WORK`、`STREET`、`MALL`、`NIGHT_MARKET`、`BANK`、`OUTDOOR`……，說明在 `places.js`。
- 想調整「多少比例的人做某件事」、輪班時間、加班比例，改 `src/core/people/rules.js`（全部集中在檔案最上方的常數）。
- 活動的中文名稱在 `labels.js`；新增活動要在那裡加一行。
- 學校、辦公大樓、工坊週末休息；鎮北銀行週一到五 08:00–17:00、週六到 14:00；小鎮銀行總行週一到五 09:00–15:30；鎮公所週一到五 08:00–17:00；夜市 18:00 開始；動物園 09:00–17:00；影城 10:00–24:00；鎮安宮 05:00–22:00；加油站 06:00–23:30，這些寫在 `buildings.js` 的 `open`、`hours`。指向休息中地點的行程會自動改成待在家。

## 外圍的新地點與工作

| 地點 | 誰在這裡工作（role → 作息） | 誰會來 |
|---|---|---|
| 小鎮機場 `x-airport` | 機組員：`role: office` + `schedule: aircrew`（見下）；地勤、櫃台、塔台、維修：`worker`，`shift` 填 `early`（05:30–14:00）或 `late`（13:00–21:30）；機場商店 `shopkeeper` | 週末全家或小朋友來看飛機（`plane-spotting`） |
| 小鎮動物園 `x-zoo` | 保育員、獸醫：`worker`（07:30–16:30，輪休）；售票、紀念品店：`shopkeeper` | 全家出遊、情侶、休假的大人和小朋友 |
| 西區／東區加油站 `g-gas-*` | `shopkeeper`（早晚班） | 自己開車的人每週加兩次油（`refuel`，下班順路或休假日上午），加油站畫面上的車子就是他們 |
| 小鎮消防隊 `c-fire` | `officer`，`shift` 填 `early`／`evening`／`night` | — |
| 鎮安宮 `c-temple` | `shopkeeper` | 長輩每週兩個上午來拜拜（`worship`），休假的大人有時也來 |
| 小鎮銀行總行 `c-bank-hq` | `clerk` | 午休辦事的人會去離家近的那家銀行 |
| 星空影城 `c-cinema` | `shopkeeper` | 學生、情侶、全家（`movie`、`movie-date`、`family-movie`） |
| 雲頂別墅 `h-villa`、天璽豪宅 `h-sky` | 住宅（`type: villa`、`luxury`） | — |

### 機組員（schedule: aircrew）

小鎮航空的兩架飛機每天各飛四趟來回（`town.js` 的 `airport.departures`），同一架飛機連續兩趟是一個班。所有 `schedule: aircrew` 的居民依 id 排序、每三位一組（機長、副機長、空服員），共 `airport.crews` 組，輪流飛這些班：有班的日子提早到機場簡報、登機、飛兩趟、講評後回家，沒班就休假。飛機從後推出機位到停回機位這段時間，點機組員會看到他們在飛機上，跟隨就會跟著飛機起飛、離場、返航、降落。新增機組員時請三人一組，並把 `crews` 改成組數。

## 搬動建築

在 `town.js` 的 `lots` 把兩個地塊的建築 id 對調即可；居民的 `home`、`work` 是建築 id，不用跟著改。

機場和動物園各佔兩個地塊：`lots` 裡寫成 `'A3+A4'`、`'F3+F4'`（兩個相鄰地塊，中間不能有道路經過，所以 `中央街` 只畫到東西環路）。兩個合併地塊之間也可以互換。
