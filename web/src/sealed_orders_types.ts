/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/sealed_orders.json`.
 */
export type SealedOrders = {
  "address": "3i78SahtFXsvLVUbEJc1cgoUk3WnUTB9LHtEwMDbNCxH",
  "metadata": {
    "name": "sealedOrders",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Sealed Orders: command your army in plain English, orders sealed in a MagicBlock Private Ephemeral Rollup"
  },
  "instructions": [
    {
      "name": "createGame",
      "docs": [
        "Base layer. Creates the game and side 0's army + intel, and pre-funds",
        "rent for the ephemeral permissions each PDA will create on the rollup."
      ],
      "discriminator": [
        124,
        69,
        75,
        66,
        184,
        220,
        72,
        206
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "gameId"
              }
            ]
          }
        },
        {
          "name": "army",
          "writable": true
        },
        {
          "name": "intel",
          "writable": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "gameId",
          "type": "u64"
        },
        {
          "name": "commander",
          "type": "pubkey"
        },
        {
          "name": "vsAi",
          "type": "bool"
        },
        {
          "name": "minSlots",
          "type": "u8"
        }
      ]
    },
    {
      "name": "delegatePda",
      "docs": [
        "Base layer. Delegate any game PDA to the (TEE) ephemeral validator."
      ],
      "discriminator": [
        248,
        217,
        193,
        46,
        124,
        191,
        64,
        135
      ],
      "accounts": [
        {
          "name": "bufferPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                40,
                63,
                29,
                198,
                108,
                22,
                48,
                138,
                113,
                79,
                169,
                69,
                29,
                246,
                50,
                149,
                168,
                36,
                147,
                89,
                155,
                168,
                65,
                251,
                116,
                94,
                67,
                189,
                86,
                238,
                8,
                250
              ]
            }
          }
        },
        {
          "name": "delegationRecordPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "pda",
          "writable": true
        },
        {
          "name": "payer",
          "signer": true
        },
        {
          "name": "validator",
          "optional": true
        },
        {
          "name": "ownerProgram",
          "address": "3i78SahtFXsvLVUbEJc1cgoUk3WnUTB9LHtEwMDbNCxH"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountType",
          "type": {
            "defined": {
              "name": "accountType"
            }
          }
        }
      ]
    },
    {
      "name": "initPermission",
      "docs": [
        "Rollup. Creates the permission for a delegated PDA. `members = None` makes",
        "it public. The PDA pays its own rent from the pre-funded lamports."
      ],
      "discriminator": [
        66,
        14,
        153,
        250,
        187,
        36,
        179,
        236
      ],
      "accounts": [
        {
          "name": "permissionedAccount",
          "writable": true
        },
        {
          "name": "permission",
          "writable": true
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "permissionProgram",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        },
        {
          "name": "ephemeralVault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountType",
          "type": {
            "defined": {
              "name": "accountType"
            }
          }
        },
        {
          "name": "members",
          "type": {
            "option": {
              "vec": {
                "defined": {
                  "name": "member"
                }
              }
            }
          }
        }
      ]
    },
    {
      "name": "issueOrders",
      "docs": [
        "Rollup. Replace orders for one or more squads. Signed by the army's own",
        "commander key; the plain-English text is kept in the sealed log so it can",
        "be revealed after the battle."
      ],
      "discriminator": [
        56,
        12,
        107,
        147,
        165,
        211,
        232,
        171
      ],
      "accounts": [
        {
          "name": "game",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "army",
          "writable": true
        },
        {
          "name": "commander",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "orders",
          "type": {
            "vec": {
              "defined": {
                "name": "orderIn"
              }
            }
          }
        },
        {
          "name": "text",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "joinGame",
      "docs": [
        "Base layer. Side 1 joins."
      ],
      "discriminator": [
        107,
        112,
        18,
        38,
        56,
        173,
        60,
        128
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "gameId"
              }
            ]
          }
        },
        {
          "name": "army",
          "writable": true
        },
        {
          "name": "intel",
          "writable": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "gameId",
          "type": "u64"
        },
        {
          "name": "commander",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  110,
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101,
                  45,
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "baseAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                181,
                183,
                0,
                225,
                242,
                87,
                58,
                192,
                204,
                6,
                34,
                1,
                52,
                74,
                207,
                151,
                184,
                53,
                6,
                235,
                140,
                229,
                25,
                152,
                204,
                98,
                126,
                24,
                147,
                128,
                167,
                62
              ]
            }
          }
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "reveal",
      "docs": [
        "Rollup. After the battle, anyone can make every account public so the",
        "full replay (positions + every order, with its original text) is readable."
      ],
      "discriminator": [
        9,
        35,
        59,
        190,
        167,
        249,
        76,
        115
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "army0",
          "writable": true
        },
        {
          "name": "army1",
          "writable": true
        },
        {
          "name": "intel0",
          "writable": true
        },
        {
          "name": "intel1",
          "writable": true
        },
        {
          "name": "permissionGame",
          "writable": true
        },
        {
          "name": "permissionArmy0",
          "writable": true
        },
        {
          "name": "permissionArmy1",
          "writable": true
        },
        {
          "name": "permissionIntel0",
          "writable": true
        },
        {
          "name": "permissionIntel1",
          "writable": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "permissionProgram",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        },
        {
          "name": "ephemeralVault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "scheduleTicks",
      "docs": [
        "Rollup. Schedule `tick` as a crank."
      ],
      "discriminator": [
        243,
        206,
        0,
        155,
        207,
        136,
        85,
        251
      ],
      "accounts": [
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "game",
          "writable": true
        },
        {
          "name": "army0",
          "writable": true
        },
        {
          "name": "army1",
          "writable": true
        },
        {
          "name": "intel0",
          "writable": true
        },
        {
          "name": "intel1",
          "writable": true
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "taskId",
          "type": "i64"
        },
        {
          "name": "intervalMs",
          "type": "i64"
        },
        {
          "name": "iterations",
          "type": "i64"
        }
      ]
    },
    {
      "name": "startGame",
      "docs": [
        "Rollup. Either commander starts the battle once both have joined."
      ],
      "discriminator": [
        249,
        47,
        252,
        172,
        184,
        162,
        245,
        14
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "commander",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "tick",
      "docs": [
        "Rollup. Advance the battle by one tick. Permissionless (the crank calls",
        "it); rate-limited by `min_slots`."
      ],
      "discriminator": [
        92,
        79,
        44,
        8,
        101,
        80,
        63,
        15
      ],
      "accounts": [
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.game_id",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "army0",
          "writable": true
        },
        {
          "name": "army1",
          "writable": true
        },
        {
          "name": "intel0",
          "writable": true
        },
        {
          "name": "intel1",
          "writable": true
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "army",
      "discriminator": [
        52,
        76,
        160,
        24,
        239,
        221,
        51,
        234
      ]
    },
    {
      "name": "game",
      "discriminator": [
        27,
        90,
        166,
        125,
        74,
        100,
        121,
        18
      ]
    },
    {
      "name": "intel",
      "discriminator": [
        44,
        3,
        72,
        188,
        117,
        22,
        158,
        65
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "gameFull",
      "msg": "Game already has two commanders."
    },
    {
      "code": 6001,
      "name": "cannotJoinOwnGame",
      "msg": "You cannot join your own game."
    },
    {
      "code": 6002,
      "name": "missingOpponent",
      "msg": "Waiting for an opponent."
    },
    {
      "code": 6003,
      "name": "notACommander",
      "msg": "Only this army's commander can do this."
    },
    {
      "code": 6004,
      "name": "alreadyStarted",
      "msg": "The battle has already started."
    },
    {
      "code": 6005,
      "name": "gameOver",
      "msg": "The battle is over."
    },
    {
      "code": 6006,
      "name": "notOver",
      "msg": "The battle is not over yet."
    },
    {
      "code": 6007,
      "name": "badOrder",
      "msg": "Invalid order."
    },
    {
      "code": 6008,
      "name": "textTooLong",
      "msg": "Order text is longer than 96 bytes."
    },
    {
      "code": 6009,
      "name": "wrongAccount",
      "msg": "Account does not match its seeds."
    }
  ],
  "types": [
    {
      "name": "accountType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "game",
            "fields": [
              {
                "name": "gameId",
                "type": "u64"
              }
            ]
          },
          {
            "name": "army",
            "fields": [
              {
                "name": "gameId",
                "type": "u64"
              },
              {
                "name": "side",
                "type": "u8"
              }
            ]
          },
          {
            "name": "intel",
            "fields": [
              {
                "name": "gameId",
                "type": "u64"
              },
              {
                "name": "side",
                "type": "u8"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "actionS",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "x",
            "type": "u8"
          },
          {
            "name": "y",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "army",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gameId",
            "type": "u64"
          },
          {
            "name": "side",
            "type": "u8"
          },
          {
            "name": "commander",
            "type": "pubkey"
          },
          {
            "name": "units",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "unitState"
                  }
                },
                3
              ]
            }
          },
          {
            "name": "logCount",
            "type": "u16"
          },
          {
            "name": "log",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "logEntry"
                  }
                },
                16
              ]
            }
          }
        ]
      }
    },
    {
      "name": "game",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gameId",
            "type": "u64"
          },
          {
            "name": "commanders",
            "type": {
              "array": [
                "pubkey",
                2
              ]
            }
          },
          {
            "name": "joined",
            "type": "u8"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "vsAi",
            "type": "bool"
          },
          {
            "name": "minSlots",
            "type": "u8"
          },
          {
            "name": "tick",
            "type": "u16"
          },
          {
            "name": "lastSlot",
            "type": "u64"
          },
          {
            "name": "control",
            "type": {
              "array": [
                "u8",
                3
              ]
            }
          },
          {
            "name": "scores",
            "type": {
              "array": [
                "u16",
                2
              ]
            }
          },
          {
            "name": "winner",
            "type": "u8"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "intel",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gameId",
            "type": "u64"
          },
          {
            "name": "side",
            "type": "u8"
          },
          {
            "name": "seen",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "seenState"
                  }
                },
                3
              ]
            }
          }
        ]
      }
    },
    {
      "name": "logEntry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "tick",
            "type": "u16"
          },
          {
            "name": "mask",
            "type": "u8"
          },
          {
            "name": "len",
            "type": "u8"
          },
          {
            "name": "text",
            "type": {
              "array": [
                "u8",
                96
              ]
            }
          }
        ]
      }
    },
    {
      "name": "member",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "flags",
            "type": "u8"
          },
          {
            "name": "pubkey",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "orderIn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "squad",
            "type": "u8"
          },
          {
            "name": "action",
            "type": {
              "defined": {
                "name": "actionS"
              }
            }
          },
          {
            "name": "rules",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "ruleIn"
                  }
                },
                2
              ]
            }
          }
        ]
      }
    },
    {
      "name": "ruleIn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trigger",
            "type": {
              "defined": {
                "name": "triggerS"
              }
            }
          },
          {
            "name": "action",
            "type": {
              "defined": {
                "name": "actionS"
              }
            }
          }
        ]
      }
    },
    {
      "name": "ruleState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trigger",
            "type": {
              "defined": {
                "name": "triggerS"
              }
            }
          },
          {
            "name": "action",
            "type": {
              "defined": {
                "name": "actionS"
              }
            }
          },
          {
            "name": "fired",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "seenState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "visible",
            "type": "u8"
          },
          {
            "name": "x",
            "type": "u8"
          },
          {
            "name": "y",
            "type": "u8"
          },
          {
            "name": "hp",
            "type": "u8"
          },
          {
            "name": "lastSeen",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "triggerS",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "a",
            "type": "u8"
          },
          {
            "name": "b",
            "type": "u8"
          },
          {
            "name": "c",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "unitState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "x",
            "type": "u8"
          },
          {
            "name": "y",
            "type": "u8"
          },
          {
            "name": "hp",
            "type": "u8"
          },
          {
            "name": "cooldown",
            "type": "u8"
          },
          {
            "name": "action",
            "type": {
              "defined": {
                "name": "actionS"
              }
            }
          },
          {
            "name": "rules",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "ruleState"
                  }
                },
                2
              ]
            }
          }
        ]
      }
    }
  ]
};
