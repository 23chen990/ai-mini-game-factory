/**
 * V11 recovery from the previously generated racing-v11-playtest.html.
 * Source SHA-256: 542239a88d814b433f9c840b892f9a361a2a00cffa25cefd8d7d2940544f61b6.
 * The catalog and all numeric geometry behavior are recovered from its actual
 * bundle. Names and comments have been restored for readability; original
 * source spelling is unavailable. All 30 outputs are checked against the
 * exact extracted minified implementation.
 */
import { V8_COURSES, sampleElevation } from './v8-course-geometry.mjs';

export const V11_COURSES = Object.freeze({
  "10": {
    "identity": "霓虹闪电：连续Z形切线接双层折返街区",
    "sketch": "0,0 190,0 310,-125 460,-75 530,80 400,195 260,130 195,295 350,410 500,310 625,440 500,590 330,550 165,665 25,530 80,370 -80,305 -215,435 -320,280 -240,115 -150,0",
    "radius": 60,
    "tight": {
      "2": 36,
      "5": 32,
      "6": 32,
      "7": 34,
      "10": 38,
      "13": 36,
      "15": 35,
      "18": 38
    },
    "sectors": [
      "北段Z形弯必须先左后右，直冲会错过下一条街",
      "内街折返有明确的回头空间，近道候选连接折返两臂",
      "南段两次延迟弯心后接西侧短S，喷气机会分成两段"
    ]
  },
  "11": {
    "identity": "海蛇湾：三排山腰道路串联两组内侧长S",
    "sketch": "0,0 200,0 270,-80 390,25 535,-65 665,50 665,185 495,185 340,130 255,220 130,155 70,310 255,345 360,290 480,355 495,510 330,520 150,455 -15,520 -170,385 -170,200 -150,0",
    "radius": 65,
    "tight": {
      "2": 37,
      "4": 37,
      "7": 35,
      "8": 39,
      "9": 40,
      "11": 35,
      "13": 33,
      "16": 38
    },
    "sectors": [
      "入口四个街角连续换向，第一次漂移就要兼顾下一个弯心",
      "山腰中排向内折入三弯S，收车后立刻反打切向对岸",
      "下排长弧给出恢复窗口，再经海湾外沿返回起点"
    ]
  },
  "12": {
    "identity": "冰旋高架：外桥大回转折入内桥窄U",
    "sketch": "0,0 190,0 275,-150 435,-185 560,-60 710,-110 845,35 785,200 625,265 545,125 395,125 360,320 495,450 385,600 215,520 85,620 -65,485 -15,320 -185,225 -295,90 -150,0",
    "radius": 62,
    "tight": {
      "2": 38,
      "5": 36,
      "8": 33,
      "9": 30,
      "10": 34,
      "13": 36,
      "16": 36,
      "19": 38
    },
    "sectors": [
      "外桥先向北抬出一组复合弯，再沿东侧完整回转",
      "内桥窄U要求连续控制同一次漂移，近道候选横跨回头口",
      "回程由大弧变成两组短斜切，落桥后仍要主动选线"
    ]
  },
  "13": {
    "identity": "皇冠内街：正交双发夹，内街穿过两枚冠齿后再次折返",
    "sketch": "0,0 240,0 240,-140 380,-140 380,70 530,70 530,-170 680,-170 680,170 530,170 530,310 370,310 370,170 220,170 220,450 20,450 20,310 -130,310 -130,170 -260,170 -100,0",
    "radius": 55,
    "tight": {
      "1": 36,
      "4": 36,
      "5": 36,
      "9": 36,
      "12": 36,
      "13": 36,
      "16": 36,
      "18": 36
    },
    "sectors": [
      "第一枚冠齿是完整的正交回头，出弯立即切入另一枚朝向相反的冠齿",
      "内街以短横街连接两个窄U，前一次漂移必须及时结束才能对准后一个入口",
      "近道只在实际内街回头上选择，主线最后仍有两组相反方向街角"
    ]
  },
  "14": {
    "identity": "双丘三叉：两座坡顶之间换边接谷底三折",
    "sketch": "0,0 190,0 415,-115 560,-35 645,-165 850,-125 920,85 790,175 830,325 650,460 500,325 345,490 190,410 105,595 -75,585 -220,410 -125,240 -275,135 -150,0",
    "radius": 65,
    "tight": {
      "2": 38,
      "4": 37,
      "7": 35,
      "10": 36,
      "12": 35,
      "15": 38,
      "17": 36
    },
    "sectors": [
      "第一座坡顶外弧接反侧第二座坡顶，空中前先把车对正",
      "东谷转弯先收紧再放开，测速点之前只有一次完整加速机会",
      "谷底三次换边后收回起跑街，不用一条直线代替收尾"
    ]
  },
  "15": {
    "identity": "极地三叶：三瓣回头各用不同入弯方向",
    "sketch": "0,0 220,0 325,-150 505,-75 490,100 655,195 570,380 385,350 305,515 435,655 285,800 100,720 35,545 -150,610 -305,460 -220,265 -30,305 -35,130 -210,135 -180,0",
    "radius": 61,
    "tight": {
      "2": 37,
      "4": 34,
      "6": 35,
      "8": 32,
      "10": 37,
      "13": 34,
      "16": 32,
      "18": 38
    },
    "sectors": [
      "第一瓣先向外绕入，第二瓣必须从另一侧接弯",
      "三瓣之间有清楚的短回正段，道具释放与漂移收车分开",
      "最后一瓣先向内回头再反切，单纯长按方向会连续失速"
    ]
  },
  "16": {
    "identity": "悬崖王冠：山腰双折返与悬崖内线决战",
    "sketch": "0,0 190,0 335,-140 545,-75 615,50 750,30 890,205 750,345 550,290 345,435 570,580 425,760 240,685 120,495 -35,550 -220,405 -130,265 -280,175 -150,0",
    "radius": 62,
    "tight": {
      "2": 36,
      "5": 38,
      "8": 32,
      "9": 32,
      "11": 36,
      "14": 34,
      "16": 34,
      "17": 37
    },
    "sectors": [
      "上山街角由宽弧收成紧邻双切，先收车再反向入弯",
      "山腰内口形成深回头，主线持续漂移与内侧近道是两种真实路线",
      "下山双折后接西侧短S，松漂回正的时机决定末段速度"
    ]
  },
  "17": {
    "identity": "剪刀立交：内折斜桥咬合正交回头庭院",
    "sketch": "0,0 190,0 270,-105 490,80 650,80 650,230 470,220 380,110 255,240 340,340 465,340 610,480 455,590 290,520 290,400 135,400 135,535 -50,535 -185,385 -80,230 -175,95 -150,0",
    "radius": 61,
    "tight": {
      "2": 35,
      "4": 33,
      "6": 35,
      "7": 32,
      "9": 32,
      "12": 35,
      "14": 32,
      "18": 35
    },
    "sectors": [
      "起跑斜街先换边，再沿上桥长弧展开",
      "剪刀内口深入主圈中央，斜向反打后马上换到出桥方向",
      "下层方庭由连续两个U口咬合，长漂与短漂必须分别处理",
      "末段斜S接回正街，保存出弯方向后再使用喷气"
    ]
  },
  "18": {
    "identity": "双谷裂隙：内谷窄U与外谷长回头成对出现",
    "sketch": "0,0 225,0 300,-140 520,-70 555,60 680,115 710,325 530,370 435,230 260,155 265,395 385,495 305,735 95,675 -5,540 -155,590 -295,420 -205,225 -70,145 -180,0",
    "radius": 62,
    "tight": {
      "2": 36,
      "5": 35,
      "8": 30,
      "9": 32,
      "10": 34,
      "13": 37,
      "16": 34,
      "18": 36
    },
    "sectors": [
      "第一道谷口先宽弧再连续短反打，漂移长度需要分别调整",
      "内谷深回头留出窄近道，主路需持续漂移后对准出口",
      "外谷长回头接谷底双切，同向长漂与短促反打交替出现"
    ]
  },
  "19": {
    "identity": "潮汐岬角：突出海角与后撤港湾交错相连",
    "sketch": "0,0 190,0 325,-155 515,-110 640,45 810,0 960,135 835,290 640,245 455,430 300,385 220,520 95,470 -25,580 -245,440 -180,250 -10,205 -90,90 -240,130 -150,0",
    "radius": 64,
    "tight": {
      "2": 37,
      "5": 36,
      "8": 34,
      "10": 32,
      "12": 34,
      "14": 37,
      "16": 30,
      "18": 34
    },
    "sectors": [
      "海角外沿三段斜弧逐次改变转向负荷",
      "每次退入港湾都要换到另一侧入弯，出湾后才有加速空间",
      "终点前港内短回头接反切，把最短的一组操作留在最后"
    ]
  },
  "20": {
    "identity": "水晶山巅：双山口急收紧与连续峰间反打",
    "sketch": "0,0 220,0 270,-170 430,-270 585,-125 710,-280 890,-235 955,-45 765,55 855,225 710,380 540,270 380,425 215,340 145,520 -45,475 -190,315 -100,160 -245,125 -180,0",
    "radius": 62,
    "tight": {
      "2": 36,
      "4": 32,
      "6": 35,
      "8": 33,
      "10": 35,
      "12": 32,
      "14": 35,
      "17": 33
    },
    "sectors": [
      "两处山口先深回头再反向出谷，不能以同样速度硬过",
      "峰间路依次收紧、放开、再收紧，考验多次独立松漂",
      "下坡末端仍有双折，不让长直线抹平前面的操作差距"
    ]
  },
  "21": {
    "identity": "双弓回环：两座长负荷内回环由收紧的中央S连接",
    "sketch": "0,0 196.8,0 295.2,-98.4 483.8,-98.4 590.4,32.8 582.2,196.8 451,270.6 303.4,221.4 213.2,147.6 155.8,246 246,311.6 172.2,410 467.4,385.4 582.2,524.8 541.2,705.2 360.8,770.8 180.4,713.4 98.4,557.6 -16.4,623.2 -131.2,516.6 -155.8,328 -49.2,221.4 -131.2,114.8 -82,0",
    "radius": 65,
    "tight": {
      "8": 38,
      "9": 38,
      "10": 38,
      "11": 38,
      "17": 40,
      "18": 38,
      "21": 38,
      "22": 38
    },
    "sectors": [
      "上回环用持续方向输入保留速度，出口直接压向中央内侧腰部",
      "中央短S连接下回环，不能把外环的一次漂移拖进腰部",
      "下回环方向与上回环不同，回程在内侧再次连续换向；全图无平面交叉"
    ]
  },
  "22": {
    "identity": "峡谷折页：宽谷折回窄谷，三折岩缝后沿对侧山壁下行",
    "sketch": "0,0 162,0 378,-135 585,-135 729,18 594,162 387,162 387,288 675,288 810,468 657,630 549,531 477,630 585,711 504,837 828,918 675,1107 378,1017 270,819 144,936 -54,909 -270,747 -351,549 -333,333 -72,216 -72,0",
    "radius": 55,
    "tight": {
      "4": 40,
      "6": 40,
      "10": 40,
      "11": 40,
      "12": 40,
      "13": 40,
      "18": 38,
      "19": 40
    },
    "sectors": [
      "宽谷沿山壁回头后立即折回内侧谷道，主线自身有连续操作要求",
      "中段三折岩缝是紧凑的相反方向弯组，每次收漂都为下一弯留位置",
      "之后沿另一侧山壁下行；近道候选需在单程终点之前且完整出口安全",
      "不使用闭合连接路补足连续弯或操作次数"
    ]
  },
  "23": {
    "identity": "群岛跳桥：三岛内庭与相反朝向的桥头U口",
    "sketch": "0,0 190,0 255,-90 400,-60 495,60 630,60 630,195 490,225 490,355 345,355 345,205 205,205 205,390 345,490 310,630 135,595 15,475 -125,550 -245,415 -245,250 -110,180 -150,0",
    "radius": 62,
    "tight": {
      "2": 36,
      "5": 35,
      "8": 32,
      "9": 30,
      "10": 32,
      "12": 34,
      "16": 35,
      "19": 36
    },
    "sectors": [
      "桥前斜S先对准出桥方向，东岛桥头马上收进第一道回头",
      "中央两座岛的U口相对，短直臂连接连续反打",
      "南岛宽弧展开后再进西岛短S，恢复窗口与漂移窗口交替出现",
      "最后一座桥头先收车再喷气，整组弯需要分开安排操作"
    ]
  },
  "24": {
    "identity": "白夜冰钩：短正交S接深内钩，沿平行内街反向脱出",
    "sketch": "0,0 210,0 210,-145 355,-145 355,0 530,0 670,130 670,350 500,510 300,510 300,240 160,240 160,590 -20,680 -200,530 -240,340 -110,290 -185,160 -180,0",
    "radius": 58,
    "tight": {
      "1": 36,
      "3": 38,
      "9": 35,
      "10": 32,
      "11": 32,
      "15": 38,
      "16": 35,
      "17": 38
    },
    "sectors": [
      "起步后的短正交S先要求两次方向切换，而非绕过孤立路边凸起",
      "外钩回到内街，深U入口和出口是两条清楚分开的平行路",
      "西侧短S与起点街相接，及时回正才有完整冲线加速段"
    ]
  },
  "25": {
    "identity": "量子高架：内外双回廊串联三次错位出桥",
    "sketch": "0,0 220,0 305,-105 450,-40 570,-160 715,-65 730,95 580,185 450,70 315,195 440,330 600,290 690,440 540,560 375,490 235,625 70,560 10,385 -150,425 -265,265 -145,145 -180,0",
    "radius": 61,
    "tight": {
      "2": 35,
      "4": 34,
      "7": 30,
      "8": 30,
      "9": 32,
      "12": 36,
      "15": 32,
      "18": 34
    },
    "sectors": [
      "上层入口先反切两次，出桥后还要跨向对侧弯心",
      "内回廊窄U连接近道候选口，主路出桥角度与近道不同",
      "外回廊以大弧接短折，第三次出桥才给完整喷气段",
      "西区结束前再补一次独立反打，避免尾段自动驾驶"
    ]
  },
  "26": {
    "identity": "落日石环：偏心岩台三瓣回转与谷口切线",
    "sketch": "0,0 190,0 360,-135 540,-30 515,110 645,195 545,395 360,350 270,510 395,675 200,800 70,695 -45,800 -240,680 -235,485 -70,385 -155,225 -315,235 -315,65 -150,0",
    "radius": 64,
    "tight": {
      "2": 36,
      "4": 33,
      "6": 35,
      "8": 33,
      "11": 35,
      "13": 34,
      "16": 31,
      "18": 36
    },
    "sectors": [
      "岩台绕行先把车带向外侧，再切进偏心内湾",
      "三瓣回转大小不同，第二瓣长负荷弯后紧接短反切",
      "西侧谷口窄回头对接出口直路，准确弯心直接换成冲线速度"
    ]
  },
  "27": {
    "identity": "云脊长蛇：横贯三组正反S，回程通过脊下内街",
    "sketch": "0,0 157.6,0 157.6,-142.82 300.43,-142.82 300.43,64.03 438.32,64.03 438.32,-83.72 595.92,-83.72 595.92,137.9 733.83,137.9 733.83,-4.92 891.42,-4.92 1019.48,123.13 980.07,290.57 812.63,349.68 704.27,231.47 561.45,231.47 561.45,418.63 394,467.88 251.17,364.45 137.9,467.88 -19.7,354.6 -137.9,167.45 -137.9,0",
    "radius": 60,
    "tight": {
      "1": 38,
      "3": 38,
      "5": 38,
      "7": 38,
      "9": 38,
      "15": 36,
      "17": 38,
      "20": 38
    },
    "sectors": [
      "山脊主干连续三组正反S，各组由短回正段连接，不靠绕外圈增加距离",
      "东端回头后进入脊下内街，方向和视线与去程明显不同",
      "近道仅从原生道路中选择，主线南段仍有双反打后才能冲线"
    ]
  },
  "28": {
    "identity": "极光分岔：北侧深指廊接三座桥头反切",
    "sketch": "0,0 220,0 195,-195 350,-305 485,-160 440,20 600,105 690,-35 870,-10 930,170 760,295 550,265 475,395 335,355 230,480 20,420 -55,250 -225,315 -305,135 -180,0",
    "radius": 63,
    "tight": {
      "1": 38,
      "3": 35,
      "5": 30,
      "6": 32,
      "9": 37,
      "11": 32,
      "14": 34,
      "17": 32
    },
    "sectors": [
      "北侧指廊用一组深回头改变整条路线方向",
      "三座桥头的反切窗口依次缩短，落地前就要选好车身朝向",
      "回程长弧与短折交替，让不同水平的玩家留下可见时间差"
    ]
  },
  "29": {
    "identity": "夜幕交错：四向街廊与内街连续晚弯心",
    "sketch": "0,0 190,0 295,-140 450,-85 440,85 605,155 750,45 870,170 760,345 585,310 455,465 285,415 205,575 35,500 -60,655 -215,525 -235,345 -60,275 -155,120 -310,145 -310,-40 -150,0",
    "radius": 61,
    "tight": {
      "2": 35,
      "4": 30,
      "6": 34,
      "9": 32,
      "12": 34,
      "15": 35,
      "17": 30,
      "19": 32
    },
    "sectors": [
      "四向街廊由不同角度接入，第二组弯开始就需要晚弯心",
      "南街连续反打将超车机会放在出弯回正段",
      "西侧内街回头后马上换向，最后两次正确收车才有完整冲线喷气"
    ]
  },
  "30": {
    "identity": "天际终章：嵌套双U与三段收紧反切连考",
    "sketch": "0,0 220,0 265,-130 415,-145 520,0 675,-95 820,0 755,160 585,235 520,120 370,160 370,285 530,355 655,480 535,635 375,545 225,640 110,480 -50,515 -190,345 -105,185 -180,0",
    "radius": 62,
    "tight": {
      "2": 34,
      "4": 31,
      "5": 32,
      "8": 30,
      "9": 30,
      "11": 34,
      "14": 35,
      "18": 32
    },
    "sectors": [
      "第一组斜S先争位置，随后外U折入更紧的内U",
      "内U提供最后一关的近道候选，方向不正会失去出口加速段",
      "南区三次不同节奏的收紧弯连考，短弯过后仍要重新选线",
      "最后反切与冲线街道相接，领先者也必须完成最后一次回正"
    ]
  },
  "01": {
    "identity": "新城攻防：街口三连反打接内街回头",
    "sketch": "0,0 220,0 325,-120 440,0 575,-100 745,80 745,280 595,280 595,100 395,100 395,380 200,505 80,330 -130,475 -300,290 -180,140 -180,0",
    "radius": 60,
    "tight": {
      "1": 37,
      "3": 39,
      "5": 38,
      "8": 32,
      "9": 34,
      "12": 36,
      "14": 35
    },
    "sectors": [
      "起跑直路接四个连续街角，第一组弯就要安排反打",
      "东街大回头后进入内街，漂移启动太晚会错过第二个弯心",
      "内街出弯回正再过斜向双折，保留速度冲线"
    ]
  },
  "02": {
    "identity": "风蚀箭谷：长弧翻过沙脊后收紧反切",
    "sketch": "0,0 220,0 395,-100 515,-60 605,-180 830,-110 855,85 690,205 790,325 640,465 455,400 315,560 130,520 55,335 235,250 100,140 -65,205 -205,130 -170,0",
    "radius": 65,
    "tight": {
      "2": 39,
      "4": 38,
      "7": 36,
      "8": 36,
      "11": 40,
      "14": 34,
      "15": 36
    },
    "sectors": [
      "沙脊上先宽弧蓄速，再用两次紧邻的反向弯切换山脊",
      "东侧岩角接第二组连续反切，上一弯要及时松漂收车",
      "谷底折返由宽变窄，出弯方向决定最后加速距离"
    ]
  },
  "03": {
    "identity": "风车立交：四臂回廊接错位切线",
    "sketch": "0,0 190,0 310,-140 460,-140 460,35 635,35 765,165 645,310 495,200 360,325 530,450 405,580 230,495 90,605 -70,465 70,325 -70,230 -230,315 -315,160 -150,0",
    "radius": 62,
    "tight": {
      "2": 38,
      "4": 34,
      "7": 38,
      "8": 36,
      "10": 35,
      "13": 39,
      "16": 34,
      "18": 38
    },
    "sectors": [
      "第一条立交臂先直角收紧，再给一段回正路",
      "连续两组斜向换线，弯心分别在路的两侧",
      "西臂短折返接最后斜切，过早喷气会扩大出弯线"
    ]
  },
  "04": {
    "identity": "海鸥湾：外海宽弧与港内窄回头交替",
    "sketch": "0,0 190,0 345,-110 505,-35 605,110 755,10 920,140 865,305 670,390 595,215 420,280 370,485 205,595 65,430 -100,520 -250,370 -120,215 -270,130 -150,0",
    "radius": 64,
    "tight": {
      "2": 39,
      "5": 37,
      "9": 34,
      "10": 36,
      "13": 38,
      "16": 35,
      "17": 38
    },
    "sectors": [
      "海岸两段大幅换向，中间给出完整回正距离",
      "外湾长弧突然切入港内凹口，持续漂移后必须及时收车",
      "山腰斜S接短出口，把末次反打留给冲线方向"
    ]
  },
  "05": {
    "identity": "失落神殿：双臂马蹄回头与内院斜切",
    "sketch": "0,0 190,0 320,-125 510,-65 575,40 705,40 815,215 675,355 505,355 505,160 330,160 330,410 170,540 -10,515 -70,345 90,275 -35,135 -205,205 -295,50 -150,0",
    "radius": 61,
    "tight": {
      "2": 36,
      "5": 38,
      "8": 32,
      "9": 30,
      "10": 34,
      "14": 36,
      "16": 32,
      "18": 38
    },
    "sectors": [
      "神殿外街宽弧接连续斜切，先争取入院位置",
      "马蹄内院两条平行臂相隔清楚，主路回头需要持续漂移后及时收车",
      "近道候选设在内院两臂之间，出口接第二次反打",
      "西庭三折收尾，不能把一次喷气贯穿整组弯"
    ]
  },
  "06": {
    "identity": "双城回廊：方形内院交错嵌入阶梯街网",
    "sketch": "0,0 190,0 265,-90 390,0 505,-90 610,30 610,190 440,190 440,70 295,70 295,270 480,270 480,430 320,430 320,575 135,575 135,400 -50,400 -50,240 -190,240 -190,90 -150,0",
    "radius": 62,
    "tight": {
      "2": 36,
      "4": 38,
      "8": 30,
      "9": 32,
      "12": 35,
      "14": 33,
      "17": 32,
      "19": 35
    },
    "sectors": [
      "北城入口三连反打，出弯后跨进内院主街",
      "东院大回头接窄内臂，持续漂移后立即准备反向出院",
      "南城用三组错位直角串成阶梯，短回正段决定下一次入弯位置",
      "西侧方庭再换边回到起跑街，不能沿同一方向一直打轮"
    ]
  },
  "07": {
    "identity": "海崖阶梯：三级错台连续回头，坡面横穿后反向落到下一层",
    "sketch": "0,0 260,0 260,150 110,150 110,300 500,300 500,450 350,450 350,600 740,600 740,750 590,750 590,900 930,900 930,1050 680,1050 480,1200 200,1260 -70,1190 -270,920 -310,650 -220,380 -100,150 -100,0",
    "radius": 60,
    "tight": {
      "2": 40,
      "4": 40,
      "6": 40,
      "8": 40,
      "10": 40,
      "12": 40,
      "14": 40
    },
    "sectors": [
      "第一层先掉头，再用短回正路立即反向进入下一条平台路",
      "第二与第三层平台逐级错开，连续漂移的结束时机直接决定下一次入弯",
      "所有技术折返均位于单程终点之前，终点之后的连接道路不计作连续弯贡献"
    ]
  },
  "08": {
    "identity": "雪岭Ω：外岭长回头套住内钩再接谷底双切",
    "sketch": "0,0 190,0 275,-110 415,-70 530,60 515,220 375,280 235,225 235,85 95,85 95,275 170,410 325,410 385,285 550,350 585,530 370,625 260,530 150,620 -80,525 -140,285 -150,0",
    "radius": 65,
    "tight": {
      "2": 37,
      "5": 35,
      "8": 32,
      "9": 32,
      "11": 35,
      "14": 37,
      "17": 36,
      "19": 35
    },
    "sectors": [
      "雪岭入口一组紧凑斜S后沿外岭展开，先稳定出弯方向",
      "Ω内钩深入主圈中央，同向长漂后反向收车脱出",
      "谷底两个紧邻的反向弯组成双切，第二次漂移要更短",
      "回到山腰前保留一段恢复街，干净出弯才能完整加速"
    ]
  },
  "09": {
    "identity": "仙人掌岭：三片岩脊尖端之间交错换线",
    "sketch": "0,0 220,0 315,-180 485,-265 600,-100 770,-100 855,110 735,215 825,355 680,560 505,415 295,510 210,360 65,425 -130,315 -70,130 -265,160 -180,0",
    "radius": 64,
    "tight": {
      "2": 38,
      "4": 37,
      "7": 36,
      "9": 36,
      "11": 35,
      "14": 39,
      "16": 34
    },
    "sectors": [
      "第一片岩脊先收紧再向外展开，测速前需要干净出弯",
      "第二片岩脊用反向折角打断连续加速",
      "最后两组弯心交错，补时后的速度需要靠切线保存"
    ]
  }
});

/** Recovered from the mobile bundle where the native loop's return connector is hidden. */
export const v11RaceFraction = course => ({ '07': .82, '22': .84 })[String(course ?? '').replace(/^race-/, '')] ?? 1;

const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const between = (a, b, value) => Math.min(a, b) - 1e-7 <= value && value <= Math.max(a, b) + 1e-7;
const onSegment = (a, b, c) => Math.abs(cross(a, b, c)) < 1e-7 && between(a[0], b[0], c[0]) && between(a[1], b[1], c[1]);

function segmentsIntersect(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0 ||
    onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

/** Convert one nonintersecting authored polygon into rounded road controls. */
export function roundV11Course(polygon, radius, tight = {}) {
  if (!Array.isArray(polygon) || polygon.length < 4 || !Number.isFinite(radius) ||
      radius < 20 || radius > 90 || polygon.some(point => point.length !== 2 || !point.every(Number.isFinite)))
    throw Error('Invalid V11 course polygon');
  const count = polygon.length;
  for (let i = 0; i < count; i++) {
    if (distance(polygon[i], polygon[(i + 1) % count]) < 25)
      throw Error('V11 road vertex spacing is too short');
    for (let j = i + 2; j < count; j++) {
      if (!(i === 0 && j === count - 1) &&
          segmentsIntersect(polygon[i], polygon[(i + 1) % count], polygon[j], polygon[(j + 1) % count]))
        throw Error('V11 road polygon intersects at edges ' + i + '/' + j);
    }
  }
  const controls = [];
  for (let i = 0; i < count; i++) {
    const previous = polygon[(i + count - 1) % count], point = polygon[i], next = polygon[(i + 1) % count];
    const incomingLength = distance(previous, point), outgoingLength = distance(point, next);
    const incomingX = (point[0] - previous[0]) / incomingLength, incomingZ = (point[1] - previous[1]) / incomingLength;
    const outgoingX = (next[0] - point[0]) / outgoingLength, outgoingZ = (next[1] - point[1]) / outgoingLength;
    const turn = Math.atan2(incomingX * outgoingZ - incomingZ * outgoingX, incomingX * outgoingX + incomingZ * outgoingZ);
    if (Math.abs(turn) < .08) {
      controls.push([point[0], point[1], 0]);
      continue;
    }
    const requestedRadius = tight[i] ?? radius;
    if (!Number.isFinite(requestedRadius) || requestedRadius < 20 || requestedRadius > 90)
      throw Error('Invalid V11 corner radius');
    const halfTurnTan = Math.tan(Math.abs(turn) / 2);
    const setback = Math.min(requestedRadius * halfTurnTan, incomingLength * .4, outgoingLength * .4);
    const actualRadius = setback / halfTurnTan;
    if (actualRadius < 13) throw Error('V11 corner needs more physical room at vertex ' + i);
    const side = Math.sign(turn), tangentX = point[0] - incomingX * setback, tangentZ = point[1] - incomingZ * setback;
    const centerX = tangentX - incomingZ * side * actualRadius, centerZ = tangentZ + incomingX * side * actualRadius;
    const startAngle = Math.atan2(tangentZ - centerZ, tangentX - centerX);
    const segments = Math.max(2, Math.ceil(Math.abs(turn) / (Math.PI / 4)));
    for (let segment = 0; segment <= segments; segment++) {
      const angle = startAngle + turn * segment / segments;
      controls.push([centerX + Math.cos(angle) * actualRadius, centerZ + Math.sin(angle) * actualRadius, 0]);
    }
  }
  const start = controls.findIndex(point => Math.abs(point[0] - polygon[0][0]) < 1e-6 && Math.abs(point[1] - polygon[0][1]) < 1e-6);
  if (start < 0) throw Error('V11 start must lie on a straight, not a rounded corner');
  const ordered = [...controls.slice(start), ...controls.slice(0, start)], points = [];
  for (let i = 0; i < ordered.length; i++) {
    const a = ordered[i], b = ordered[(i + 1) % ordered.length];
    const segments = Math.max(1, Math.ceil(distance(a, b) / 95));
    for (let segment = 0; segment < segments; segment++) {
      const fraction = segment / segments;
      points.push([+(a[0] + (b[0] - a[0]) * fraction).toFixed(4), +(a[1] + (b[1] - a[1]) * fraction).toFixed(4), 0]);
    }
  }
  if (points.length > 160) throw Error('V11 mobile road control budget exceeded');
  return points;
}

const courseCache = new Map();

/** Apply the existing elevation signature by physical planar arclength. */
export function createV11CourseGeometry(id) {
  const design = V11_COURSES[id];
  if (!design) throw Error('Unknown V11 course ' + id);
  if (!courseCache.has(id)) {
    const polygon = design.sketch.trim().split(/\s+/).map(point => point.split(',').map(Number));
    const planPoints = roundV11Course(polygon, design.radius, design.tight);
    const lengths = planPoints.map((point, i) => distance(point, planPoints[(i + 1) % planPoints.length]));
    const perimeterM = lengths.reduce((sum, length) => sum + length, 0);
    let along = 0;
    const points = planPoints.map((point, i) => {
      const height = sampleElevation(V8_COURSES[id].knots, along / perimeterM);
      along += lengths[i];
      return [point[0], point[1], +height.toFixed(4)];
    });
    const maxGrade = Math.max(...points.map((point, i) => Math.abs(points[(i + 1) % points.length][2] - point[2]) / lengths[i]));
    if (maxGrade > .21 || perimeterM < 1900 || perimeterM > 5700)
      throw Error('V11 physical grade or length needs reauthoring ' + id + ': ' + maxGrade.toFixed(3) + ' / ' + perimeterM.toFixed(0));
    const cornerIndex = Number(Object.keys(design.tight)[0] ?? 2), corner = polygon[cornerIndex];
    let nearestDistance = Infinity, nearestIndex = 0;
    planPoints.forEach((point, i) => {
      const gap = distance(point, corner);
      if (gap < nearestDistance) { nearestDistance = gap; nearestIndex = i; }
    });
    const at = lengths.slice(0, nearestIndex).reduce((sum, length) => sum + length, 0) / perimeterM;
    const widthProfile = [{ at, span: .035, factor: .9 }, { at: (at + .15) % 1, span: .055, factor: 1.045 }];
    courseCache.set(id, { planPoints, points, perimeterM, maxGrade, identity: design.identity, widthProfile });
  }
  const cached = courseCache.get(id);
  return { ...cached, planPoints: cached.planPoints.map(point => point.slice()), points: cached.points.map(point => point.slice()),
    widthProfile: cached.widthProfile.map(band => ({ ...band })) };
}
