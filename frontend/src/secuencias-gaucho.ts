// Datos copiados de los animacion.json originales; no usar los bucles de preview.
export const secuencias = {
  "atencion": {
    "frame_size": [
      640,
      724
    ],
    "frame_count": 4,
    "animations": {
      "concentrado": {
        "frames": [
          0
        ],
        "loop": false
      },
      "entrar_atento": {
        "frames": [
          0,
          1,
          2,
          3
        ],
        "frame_ms": 140,
        "loop": false,
        "hold_last": true
      },
      "atento": {
        "frames": [
          3
        ],
        "loop": false
      },
      "volver_concentrado": {
        "frames": [
          3,
          2,
          1,
          0
        ],
        "frame_ms": 140,
        "loop": false,
        "hold_last": true
      }
    },
    "frames": [
      {
        "index": 0,
        "file": "frames/atencion_00.png",
        "rect": [
          0,
          0,
          640,
          724
        ]
      },
      {
        "index": 1,
        "file": "frames/atencion_01.png",
        "rect": [
          640,
          0,
          640,
          724
        ]
      },
      {
        "index": 2,
        "file": "frames/atencion_02.png",
        "rect": [
          1280,
          0,
          640,
          724
        ]
      },
      {
        "index": 3,
        "file": "frames/atencion_03.png",
        "rect": [
          1920,
          0,
          640,
          724
        ]
      }
    ]
  },
  "pensando": {
    "frame_size": [
      640,
      724
    ],
    "frame_count": 5,
    "frames": [
      {
        "index": 0,
        "file": "frames/pensando_00.png",
        "rect": [
          0,
          0,
          640,
          724
        ],
        "duration_ms": 800
      },
      {
        "index": 1,
        "file": "frames/pensando_01.png",
        "rect": [
          640,
          0,
          640,
          724
        ],
        "duration_ms": 220
      },
      {
        "index": 2,
        "file": "frames/pensando_02.png",
        "rect": [
          1280,
          0,
          640,
          724
        ],
        "duration_ms": 500
      },
      {
        "index": 3,
        "file": "frames/pensando_03.png",
        "rect": [
          1920,
          0,
          640,
          724
        ],
        "duration_ms": 240
      },
      {
        "index": 4,
        "file": "frames/pensando_04.png",
        "rect": [
          2560,
          0,
          640,
          724
        ],
        "duration_ms": 800
      }
    ],
    "loop": true
  },
  "respondiendo": {
    "frame_size": [
      640,
      724
    ],
    "frame_count": 4,
    "playback": {
      "respond": {
        "frames": [
          0,
          1,
          2,
          3
        ],
        "durations_ms": [
          120,
          180,
          180,
          0
        ],
        "loop": false,
        "hold_last": true
      },
      "return_attentive": {
        "frames": [
          0
        ],
        "loop": false
      }
    },
    "frames": [
      {
        "index": 0,
        "file": "frames/respondiendo_00.png",
        "rect": [
          0,
          0,
          640,
          724
        ]
      },
      {
        "index": 1,
        "file": "frames/respondiendo_01.png",
        "rect": [
          640,
          0,
          640,
          724
        ]
      },
      {
        "index": 2,
        "file": "frames/respondiendo_02.png",
        "rect": [
          1280,
          0,
          640,
          724
        ]
      },
      {
        "index": 3,
        "file": "frames/respondiendo_03.png",
        "rect": [
          1920,
          0,
          640,
          724
        ]
      }
    ]
  },
  "mazo": {
    "frame_size": [
      640,
      724
    ],
    "frame_count": 6,
    "animations": {
      "espanola_a_inglesa": {
        "sequence": [
          0,
          1,
          2,
          3,
          4,
          5
        ],
        "frame_ms": 180,
        "swap_at_frame": 3,
        "loop": false,
        "hold_last": true
      },
      "inglesa_a_espanola": {
        "sequence": [
          5,
          4,
          3,
          2,
          1,
          0
        ],
        "frame_ms": 180,
        "swap_at_frame": 2,
        "loop": false,
        "hold_last": true
      }
    },
    "frames": [
      {
        "index": 0,
        "file": "frames/mazo_00.png",
        "rect": [
          0,
          0,
          640,
          724
        ],
        "deck": "espanola"
      },
      {
        "index": 1,
        "file": "frames/mazo_01.png",
        "rect": [
          640,
          0,
          640,
          724
        ],
        "deck": "espanola"
      },
      {
        "index": 2,
        "file": "frames/mazo_02.png",
        "rect": [
          1280,
          0,
          640,
          724
        ],
        "deck": "espanola"
      },
      {
        "index": 3,
        "file": "frames/mazo_03.png",
        "rect": [
          1920,
          0,
          640,
          724
        ],
        "deck": "inglesa"
      },
      {
        "index": 4,
        "file": "frames/mazo_04.png",
        "rect": [
          2560,
          0,
          640,
          724
        ],
        "deck": "inglesa"
      },
      {
        "index": 5,
        "file": "frames/mazo_05.png",
        "rect": [
          3200,
          0,
          640,
          724
        ],
        "deck": "inglesa"
      }
    ]
  }
} as const

// Ciclo revisado en gaucho-prueba-cierre-sombrero/prueba.html.
export const respuestaSombrero = {
  "sequence": [
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8
  ],
  "durations_ms": [
    120,
    180,
    180,
    550,
    350,
    450,
    600,
    350,
    0
  ],
  "loop": false,
  "hold_last": true,
  "keep_answer_visible": true
} as const
