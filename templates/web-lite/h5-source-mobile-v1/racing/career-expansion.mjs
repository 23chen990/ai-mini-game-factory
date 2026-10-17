/** Original 17-30 closed-route blueprints. Each is a separately authored
 * Catmull-Rom centerline; four existing biome art families are reused, NOT
 * road geometry. Difficulty comes from tighter physical width, S-bends,
 * extra racing laps and stricter competitive goals, never fake collisions.
 * All locations are locally authored; no source game map is copied.
 */
export const EXPANSION_COURSES = Object.freeze({
  "17": {
    "title": "霓虹剪刀湾",
    "feel": "都市双弧急变线",
    "english": "NEON SHEARS",
    "map": "city",
    "scale": 0.86,
    "width": 18,
    "laps": 2,
    "kind": "drift",
    "mode": "speed",
    "rank": 2,
    "goal": "6 次有效漂移并进入前二",
    "target": 6,
    "technical": [
      [
        1,
        18,
        -1
      ],
      [
        3,
        16,
        1
      ],
      [
        9,
        17,
        1
      ],
      [
        11,
        17,
        -1
      ]
    ],
    "sketch": "0,0,0 170,-5,0 350,-15,0 500,45,1 595,140,2 605,270,1 500,360,0 380,325,0 305,405,0 365,515,0 220,590,0 40,585,0 -125,525,0 -230,400,0 -245,250,0 -145,130,0 -45,75,0",
    "sky": [
      "#25366d",
      "#c2baff",
      "#577fc0"
    ],
    "accent": 4449013
  },
  "18": {
    "title": "黄沙双沟",
    "feel": "折叠沙谷两次长回头",
    "english": "DUNE DOUBLE CUT",
    "map": "egypt",
    "scale": 0.84,
    "width": 18,
    "laps": 2,
    "kind": "race",
    "mode": "speed",
    "rank": 2,
    "goal": "两圈追逐，保持前二",
    "technical": [
      [
        1,
        18,
        1
      ],
      [
        3,
        17,
        -1
      ],
      [
        9,
        18,
        -1
      ],
      [
        11,
        17,
        1
      ]
    ],
    "sketch": "0,0,0 180,-10,0 375,15,0 530,90,1 635,200,3 590,315,5 455,365,4 360,305,2 265,375,1 305,505,0 180,625,0 10,660,0 -165,590,0 -285,475,0 -285,330,0 -205,195,0 -80,120,0",
    "sky": [
      "#7d526f",
      "#f7d6a0",
      "#c98e61"
    ],
    "accent": 15907947
  },
  "19": {
    "title": "潮汐断岬",
    "feel": "内湾双发卡与临海攻防",
    "english": "TIDAL CAPES",
    "map": "aegean",
    "scale": 0.85,
    "width": 17.8,
    "laps": 2,
    "kind": "overtake",
    "mode": "speed",
    "rank": 2,
    "goal": "真实弯道超车 4 次并进入前二",
    "target": 4,
    "technical": [
      [
        1,
        18,
        -1
      ],
      [
        3,
        17,
        1
      ],
      [
        9,
        18,
        1
      ],
      [
        11,
        18,
        -1
      ]
    ],
    "sketch": "0,0,0 175,-15,1 350,-20,3 520,50,6 640,145,10 635,290,16 525,400,19 415,355,15 320,440,13 390,565,18 270,690,20 105,685,17 -80,615,12 -225,505,8 -275,340,5 -200,205,2 -60,115,1",
    "sky": [
      "#2c6388",
      "#a8dfdb",
      "#74b6bb"
    ],
    "accent": 4907968
  },
  "20": {
    "title": "寒晶折冠",
    "feel": "冰湖三段连续左右换线",
    "english": "FROSTED CROWN",
    "map": "snow",
    "scale": 0.83,
    "width": 17.8,
    "laps": 2,
    "kind": "item",
    "mode": "item",
    "rank": 2,
    "goal": "真实拾取 4 个道具并进入前二",
    "target": 4,
    "technical": [
      [
        1,
        18,
        1
      ],
      [
        3,
        18,
        -1
      ],
      [
        9,
        18,
        -1
      ],
      [
        12,
        17,
        1
      ]
    ],
    "sketch": "0,0,0 190,-25,0 365,-30,2 535,25,4 675,140,8 650,290,12 520,355,15 450,270,12 345,355,10 405,485,12 280,600,14 165,540,10 45,660,12 -145,625,8 -265,490,5 -265,320,3 -175,180,0 -50,90,0",
    "sky": [
      "#3c5d92",
      "#d6edff",
      "#8cc3e8"
    ],
    "accent": 8445949
  },
  "21": {
    "title": "星港双弓",
    "feel": "两次高架转向后冲刺",
    "english": "STARBORNE BOWS",
    "map": "city",
    "scale": 0.81,
    "width": 17.6,
    "laps": 3,
    "kind": "race",
    "mode": "speed",
    "rank": 1,
    "goal": "三圈攻防，夺得第一名",
    "technical": [
      [
        1,
        18,
        -1
      ],
      [
        3,
        18,
        1
      ],
      [
        9,
        17,
        -1
      ],
      [
        11,
        18,
        1
      ],
      [
        13,
        17,
        -1
      ]
    ],
    "sketch": "0,0,0 180,-15,0 370,-25,0 550,55,2 710,170,6 670,335,8 510,390,8 420,300,5 295,375,4 365,515,6 255,665,7 70,680,5 -110,590,3 -245,450,0 -235,275,0 -135,140,0 -35,75,0",
    "sky": [
      "#272b66",
      "#b7b0ed",
      "#556ba8"
    ],
    "accent": 12098047
  },
  "22": {
    "title": "碎岩齿谷",
    "feel": "双侧刹车弯与急速出口",
    "english": "BROKEN RIDGE",
    "map": "egypt",
    "scale": 0.82,
    "width": 17.6,
    "laps": 2,
    "kind": "speed",
    "mode": "speed",
    "rank": 2,
    "goal": "测速门至少一次达到 195 km/h，进入前二",
    "target": 195,
    "technical": [
      [
        1,
        19,
        1
      ],
      [
        3,
        19,
        -1
      ],
      [
        9,
        18,
        1
      ],
      [
        11,
        18,
        -1
      ],
      [
        13,
        17,
        1
      ]
    ],
    "sketch": "0,0,0 185,-5,0 385,-20,0 555,35,1 705,160,2 665,325,0 520,405,0 435,330,0 345,420,0 390,565,0 250,705,0 65,690,0 -130,640,0 -295,490,0 -310,325,0 -220,200,0 -75,90,0",
    "sky": [
      "#91586e",
      "#ffd7a6",
      "#d99f6b"
    ],
    "accent": 15313229
  },
  "23": {
    "title": "群岛反潮",
    "feel": "岛链大S与狭窄发卡",
    "english": "ISLAND SWITCHBACK",
    "map": "aegean",
    "scale": 0.82,
    "width": 17.5,
    "laps": 3,
    "kind": "drift",
    "mode": "speed",
    "rank": 2,
    "goal": "7 次有效漂移并进入前二",
    "target": 7,
    "technical": [
      [
        1,
        19,
        -1
      ],
      [
        3,
        18,
        1
      ],
      [
        9,
        19,
        -1
      ],
      [
        11,
        18,
        1
      ],
      [
        13,
        18,
        -1
      ]
    ],
    "sketch": "0,0,0 190,-10,1 380,5,4 560,85,8 690,220,12 610,355,16 485,405,18 395,330,16 290,425,19 355,570,22 240,715,20 70,730,15 -135,665,11 -260,535,8 -275,365,5 -160,210,2 -55,95,1",
    "sky": [
      "#1d5c80",
      "#d1f3ec",
      "#7bb7c8"
    ],
    "accent": 7791340
  },
  "24": {
    "title": "白夜倒钩",
    "feel": "倒钩雪脊与窄门突围",
    "english": "POLAR HOOK",
    "map": "snow",
    "scale": 0.81,
    "width": 17.5,
    "laps": 2,
    "kind": "elimination",
    "mode": "speed",
    "rank": 2,
    "goal": "避开两次末位淘汰，进入前二",
    "technical": [
      [
        1,
        19,
        1
      ],
      [
        3,
        19,
        -1
      ],
      [
        9,
        18,
        1
      ],
      [
        11,
        18,
        -1
      ],
      [
        13,
        18,
        1
      ]
    ],
    "sketch": "0,0,0 185,-30,1 380,-35,3 545,35,5 695,170,10 620,335,16 490,395,19 405,300,16 290,395,18 360,530,21 230,685,23 55,695,20 -140,650,13 -285,515,8 -300,345,5 -210,195,3 -60,85,1",
    "sky": [
      "#35547e",
      "#e3f3ff",
      "#9ebddf"
    ],
    "accent": 11856639
  },
  "25": {
    "title": "量子折轨",
    "feel": "城际四段折线争夺",
    "english": "QUANTUM KINK",
    "map": "city",
    "scale": 0.8,
    "width": 17.3,
    "laps": 3,
    "kind": "item",
    "mode": "item",
    "rank": 2,
    "goal": "实取 5 个道具并进入前二",
    "target": 5,
    "technical": [
      [
        1,
        19,
        -1
      ],
      [
        3,
        19,
        1
      ],
      [
        9,
        19,
        -1
      ],
      [
        11,
        18,
        1
      ],
      [
        13,
        18,
        -1
      ]
    ],
    "sketch": "0,0,0 205,-25,0 395,-30,0 575,35,2 745,160,5 680,325,8 535,385,9 450,290,6 335,390,4 415,535,7 295,700,8 90,725,6 -140,655,4 -300,500,2 -310,315,0 -190,170,0 -50,85,0",
    "sky": [
      "#2d3874",
      "#caafec",
      "#6281bb"
    ],
    "accent": 14722298
  },
  "26": {
    "title": "落日石轮",
    "feel": "连续变向与长直道守位",
    "english": "DUSK GEAR",
    "map": "egypt",
    "scale": 0.8,
    "width": 17.3,
    "laps": 3,
    "kind": "race",
    "mode": "speed",
    "rank": 1,
    "goal": "三圈稳定守位，夺得冠军",
    "technical": [
      [
        1,
        19,
        1
      ],
      [
        3,
        19,
        -1
      ],
      [
        9,
        19,
        1
      ],
      [
        11,
        18,
        -1
      ],
      [
        13,
        18,
        1
      ]
    ],
    "sketch": "0,0,0 200,-25,0 390,-25,0 560,65,1 720,205,4 640,355,7 505,425,6 430,330,4 310,425,5 380,575,2 240,740,0 60,750,0 -165,670,0 -310,515,0 -315,350,0 -205,200,0 -55,90,0",
    "sky": [
      "#95536a",
      "#f9c18b",
      "#ba7958"
    ],
    "accent": 16761963
  },
  "27": {
    "title": "断云连蛇",
    "feel": "五段坡弯和高架走线",
    "english": "CLOUD SERPENT",
    "map": "aegean",
    "scale": 0.78,
    "width": 17.2,
    "laps": 3,
    "kind": "overtake",
    "mode": "speed",
    "rank": 1,
    "goal": "至少 5 次真实弯道反超并获得第一",
    "target": 5,
    "technical": [
      [
        1,
        19,
        -1
      ],
      [
        3,
        19,
        1
      ],
      [
        9,
        19,
        -1
      ],
      [
        11,
        19,
        1
      ],
      [
        13,
        19,
        -1
      ]
    ],
    "sketch": "0,0,0 195,-25,1 410,-30,4 590,45,7 750,205,11 665,380,16 520,435,20 440,335,17 300,430,19 380,590,22 245,760,24 65,775,22 -145,700,16 -305,550,11 -315,370,6 -190,205,3 -60,100,1",
    "sky": [
      "#1c5779",
      "#bddfec",
      "#79a9c7"
    ],
    "accent": 7136456
  },
  "28": {
    "title": "极光三叉",
    "feel": "冰峰切线和连串急弯",
    "english": "AURORA FORK",
    "map": "snow",
    "scale": 0.79,
    "width": 17.2,
    "laps": 3,
    "kind": "item",
    "mode": "item",
    "rank": 1,
    "goal": "实取 5 个道具并夺冠",
    "target": 5,
    "technical": [
      [
        1,
        20,
        1
      ],
      [
        3,
        19,
        -1
      ],
      [
        9,
        19,
        1
      ],
      [
        11,
        19,
        -1
      ],
      [
        13,
        19,
        1
      ]
    ],
    "sketch": "0,0,0 205,-25,2 410,-35,4 590,35,8 760,185,12 675,360,17 530,425,20 450,315,16 330,415,18 400,575,21 255,760,22 65,760,18 -155,690,12 -300,545,7 -305,360,4 -180,185,2 -50,85,1",
    "sky": [
      "#394c9a",
      "#e9dfff",
      "#96b5e3"
    ],
    "accent": 11197951
  },
  "29": {
    "title": "夜幕十字峰",
    "feel": "四段盲弯后抢最后内线",
    "english": "MIDNIGHT CROSS",
    "map": "city",
    "scale": 0.76,
    "width": 17,
    "laps": 3,
    "kind": "race",
    "mode": "speed",
    "rank": 1,
    "goal": "三圈极限攻防，守住第一名",
    "technical": [
      [
        1,
        20,
        -1
      ],
      [
        3,
        20,
        1
      ],
      [
        9,
        20,
        -1
      ],
      [
        11,
        19,
        1
      ],
      [
        13,
        19,
        -1
      ]
    ],
    "sketch": "0,0,0 215,-30,0 430,-40,2 610,45,4 770,205,6 700,385,9 545,455,9 460,340,7 320,455,5 410,630,8 270,785,9 60,800,7 -160,715,5 -320,565,3 -330,380,1 -210,215,0 -65,95,0",
    "sky": [
      "#1c2958",
      "#9a8ac5",
      "#4b6297"
    ],
    "accent": 16552171
  },
  "30": {
    "title": "天空终局",
    "feel": "绝壁倒钩·最后车神争夺",
    "english": "SKYLINE FINAL",
    "map": "aegean",
    "scale": 0.75,
    "width": 17,
    "laps": 3,
    "kind": "boss",
    "mode": "speed",
    "rank": 1,
    "goal": "在三圈终局击败最强车神并夺冠",
    "technical": [
      [
        1,
        20,
        1
      ],
      [
        3,
        20,
        -1
      ],
      [
        9,
        20,
        1
      ],
      [
        11,
        19,
        -1
      ],
      [
        13,
        19,
        1
      ]
    ],
    "sketch": "0,0,0 215,-40,1 445,-50,4 620,45,8 785,210,13 710,400,20 550,465,23 465,350,19 335,465,21 430,640,24 280,820,24 65,815,21 -175,740,17 -325,580,11 -335,385,6 -215,215,2 -70,100,1",
    "sky": [
      "#2a3868",
      "#dec0e6",
      "#7e8cb5"
    ],
    "accent": 16766596
  }
});

/** Full campaign: chapter 5-8, progressively tighter courses and rank goals.
 * Stored stars stay keyed to two-character course IDs so V5.3 saves survive.
 */
export const EXTRA_STAGES = Object.freeze(Object.entries(EXPANSION_COURSES).map(([id,plan])=>Object.freeze({
  id,chapter:Math.ceil(Number(id)/4),name:plan.title,map:plan.map,
  course:'race-'+id,laps:plan.laps,diff:2,kind:plan.kind,mode:plan.mode,
  rank:plan.rank,goal:plan.goal,
  ...(Object.hasOwn(plan,'target')?{target:plan.target}:{}),
})));
