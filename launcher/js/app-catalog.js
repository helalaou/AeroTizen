// App identities and fallback branding. Edit this file to add or update an app.
// IDs are strings. Only add IDs verified from a TV or the existing launcher.
// Legacy names retain the previous exact-artwork and prefix-brand matches until
// more app IDs are verified. Lookup logic lives in app-lookup.js.
window.AeroTizen.catalog = {
  "apps": [
    {
      "key": "youtube",
      "name": "YouTube",
      "variants": [
        {
          "appId": "9Ur5IzDKqV.TizenYouTube",
          "storeId": "111299001912"
        }
      ],
      "legacy": {
        "brandPrefixes": [
          "youtube"
        ],
        "artworkNames": [
          "youtube"
        ]
      },
      "fallback": {
        "background": "#ffffff",
        "logo": {
          "slug": "youtube",
          "version": "16.35.0"
        },
        "logoColour": "#ff0000",
        "label": "YouTube",
        "textColour": "#0f0f0f"
      }
    },
    {
      "key": "netflix",
      "name": "Netflix",
      "variants": [
        {
          "appId": "org.tizen.netflix-app",
          "storeId": "3201907018807",
          "preloaded": true
        }
      ],
      "legacy": {
        "brandPrefixes": [
          "netflix"
        ]
      },
      "fallback": {
        "background": "linear-gradient(135deg,#e50914,#8a0610)",
        "logo": {
          "slug": "netflix",
          "version": "16.35.0"
        },
        "logoColour": "#ffffff",
        "label": null,
        "textColour": null
      }
    },
    {
      "key": "prime-video",
      "name": "Prime Video",
      "variants": [
        {
          "appId": "org.tizen.primevideo",
          "storeId": "3201910019365",
          "preloaded": true
        }
      ],
      "legacy": {
        "brandPrefixes": [
          "prime video"
        ],
        "artworkNames": [
          "prime video",
          "amazon prime video"
        ]
      },
      "fallback": {
        "background": "linear-gradient(135deg,#1a98ff,#0f4c81)",
        "logo": {
          "slug": "primevideo",
          "version": "13.0.0"
        },
        "logoColour": "#ffffff",
        "label": null,
        "textColour": null,
        "largeLogo": true
      }
    },
    {
      "key": "spotify",
      "name": "Spotify",
      "variants": [
        {
          "storeId": "3202007021175"
        }
      ],
      "legacy": {
        "brandPrefixes": [
          "spotify"
        ],
        "artworkNames": [
          "spotify"
        ]
      },
      "fallback": {
        "background": "linear-gradient(135deg,#1ed760,#0f8a3c)",
        "logo": {
          "slug": "spotify",
          "version": "16.35.0"
        },
        "logoColour": "#000000",
        "label": "Spotify",
        "textColour": "#000000"
      }
    },
    {
      "key": "stremio",
      "name": "Stremio",
      "variants": [
        {
          "appId": "IkWsFHtOY9.Stremio",
          "storeId": "3202306031311"
        }
      ],
      "legacy": {
        "brandPrefixes": [
          "stremio"
        ],
        "artworkNames": [
          "stremio"
        ]
      },
      "fallback": {
        "background": "linear-gradient(135deg,#7b5bf5,#2b1d68)",
        "logo": {
          "slug": "stremio",
          "version": "16.35.0"
        },
        "logoColour": "#ffffff",
        "label": "Stremio",
        "textColour": "#ffffff"
      }
    },
    {
      "key": "max",
      "name": "Max",
      "variants": [],
      "legacy": {
        "brandPrefixes": [
          "max"
        ]
      },
      "fallback": {
        "background": "#002be7",
        "logo": {
          "slug": "max",
          "version": "16.35.0"
        },
        "logoColour": "#ffffff",
        "label": null,
        "textColour": null
      }
    },
    {
      "key": "hulu",
      "name": "Hulu",
      "variants": [],
      "legacy": {
        "brandPrefixes": [
          "hulu"
        ]
      },
      "fallback": {
        "background": "#1ce783",
        "logo": {
          "slug": "hulu",
          "version": "9.0.0"
        },
        "logoColour": "#0b0c0f",
        "label": null,
        "textColour": null
      }
    },
    {
      "key": "apple-tv",
      "name": "Apple TV",
      "variants": [],
      "legacy": {
        "brandPrefixes": [
          "apple tv"
        ]
      },
      "fallback": {
        "background": "linear-gradient(135deg,#4a4a4f,#1c1c1e)",
        "logo": {
          "slug": "appletv",
          "version": "16.35.0"
        },
        "logoColour": "#ffffff",
        "label": null,
        "textColour": null
      }
    },
    {
      "key": "plex",
      "name": "Plex",
      "variants": [],
      "legacy": {
        "brandPrefixes": [
          "plex"
        ]
      },
      "fallback": {
        "background": "#1f1f1f",
        "logo": {
          "slug": "plex",
          "version": "16.35.0"
        },
        "logoColour": "#ebaf00",
        "label": null,
        "textColour": null
      }
    },
    {
      "key": "twitch",
      "name": "Twitch",
      "variants": [],
      "legacy": {
        "brandPrefixes": [
          "twitch"
        ]
      },
      "fallback": {
        "background": "#9146ff",
        "logo": {
          "slug": "twitch",
          "version": "16.35.0"
        },
        "logoColour": "#ffffff",
        "label": "Twitch",
        "textColour": "#ffffff"
      }
    },
    {
      "key": "crunchyroll",
      "name": "Crunchyroll",
      "variants": [],
      "legacy": {
        "brandPrefixes": [
          "crunchyroll"
        ]
      },
      "fallback": {
        "background": "#f47521",
        "logo": {
          "slug": "crunchyroll",
          "version": "16.35.0"
        },
        "logoColour": "#ffffff",
        "label": "Crunchyroll",
        "textColour": "#ffffff"
      }
    },
    {
      "key": "paramount",
      "name": "Paramount+",
      "variants": [],
      "legacy": {
        "brandPrefixes": [
          "paramount"
        ]
      },
      "fallback": {
        "background": "#0064ff",
        "logo": {
          "slug": "paramountplus",
          "version": "16.35.0"
        },
        "logoColour": "#ffffff",
        "label": null,
        "textColour": null
      }
    },
    {
      "key": "tubi",
      "name": "Tubi",
      "variants": [],
      "legacy": {
        "brandPrefixes": [
          "tubi"
        ]
      },
      "fallback": {
        "background": "#7408ff",
        "logo": {
          "slug": "tubi",
          "version": "16.35.0"
        },
        "logoColour": "#ffffff",
        "label": null,
        "textColour": null
      }
    },
    {
      "key": "jellyfin",
      "name": "Jellyfin",
      "variants": [],
      "legacy": {
        "brandPrefixes": [
          "jellyfin"
        ]
      },
      "fallback": {
        "background": "linear-gradient(135deg,#aa5cc3,#00a4dc)",
        "logo": {
          "slug": "jellyfin",
          "version": "16.35.0"
        },
        "logoColour": "#ffffff",
        "label": "Jellyfin",
        "textColour": "#ffffff"
      }
    },
    {
      "key": "disney",
      "name": "Disney+",
      "variants": [
        {
          "appId": "MCmYXNxgcu.DisneyPlus",
          "storeId": "3201901017640"
        }
      ],
      "legacy": {
        "brandPrefixes": [
          "disney"
        ],
        "artworkNames": [
          "disney+"
        ]
      },
      "fallback": {
        "background": "linear-gradient(135deg,#1a3fa3,#06102e)",
        "logo": null,
        "logoColour": null,
        "label": "Disney+",
        "textColour": "#ffffff"
      }
    },
    {
      "key": "tizenbrew",
      "name": "TizenBrew",
      "variants": [],
      "legacy": {
        "brandPrefixes": [
          "tizenbrew"
        ]
      },
      "fallback": {
        "background": "linear-gradient(135deg,#ff9e1b,#7a2c00)",
        "logo": null,
        "logoColour": null,
        "label": "TizenBrew",
        "textColour": "#ffffff",
        "useAppIcon": true
      }
    },
    {
      "key": "bbc-iplayer",
      "name": "BBC iPlayer",
      "variants": [
        {
          "appId": "DqEoaplKlw.bbchybrid",
          "storeId": "3201601007670"
        }
      ],
      "legacy": {
        "artworkNames": [
          "bbc iplayer"
        ]
      }
    },
    {
      "key": "bbc-sounds",
      "name": "BBC Sounds",
      "variants": [
        {
          "appId": "GR7TWEBh5d.BBCSounds",
          "storeId": "3202003020365"
        }
      ],
      "legacy": {
        "artworkNames": [
          "bbc sounds"
        ]
      }
    },
    {
      "key": "itvx",
      "name": "ITVX",
      "variants": [
        {
          "appId": "OEvCiupaFR.ITVHub",
          "storeId": "121299000089"
        }
      ],
      "legacy": {
        "artworkNames": [
          "itvx",
          "itv hub"
        ]
      }
    },
    {
      "key": "channel-4",
      "name": "Channel 4",
      "variants": [
        {
          "appId": "OCaxbgg9v6.chfourctv",
          "storeId": "111299002148"
        }
      ],
      "legacy": {
        "artworkNames": [
          "channel 4",
          "all 4"
        ]
      }
    },
    {
      "key": "u",
      "name": "U",
      "variants": [
        {
          "appId": "VQr0RGkyS9.UKTVPlay",
          "storeId": "3201806016432"
        }
      ],
      "legacy": {
        "artworkNames": [
          "u",
          "uktv play"
        ]
      }
    },
    {
      "key": "5",
      "name": "5",
      "variants": [
        {
          "appId": "EkzyZtmneG.My5",
          "storeId": "121299000612"
        }
      ],
      "legacy": {
        "artworkNames": [
          "5",
          "my5"
        ]
      }
    },
    {
      "key": "samsung-tv-plus",
      "name": "Samsung TV Plus",
      "variants": [
        {
          "storeId": "3202405035480"
        }
      ],
      "legacy": {
        "artworkNames": [
          "samsung tv plus"
        ]
      }
    }
  ]
};
