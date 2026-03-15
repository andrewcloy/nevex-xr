import nevexLogoPrimaryUrl from "./logos/nevex_logo_primary.png";
import nevexLogoDarkUrl from "./logos/nevex_logo_dark.png";
import nevexSplashHeroUrl from "./splash/nevex_splash_hero.png";
import nevexSplashForestUrl from "./splash/nevex_splash_forest.png";
import nevexSplashSpaceUrl from "./splash/nevex_splash_space.png";
import iconZoomSliderUrl from "./icons/icon_zoom_slider.png";
import iconExitUrl from "./icons/icon_exit.png";
import iconAiUrl from "./icons/icon_ai.png";
import iconBatteryUrl from "./icons/icon_battery.png";
import iconDayNightUrl from "./icons/icon_day_night.png";
import iconSearchUrl from "./icons/icon_search.png";
import iconCameraUrl from "./icons/icon_camera.png";
import iconRecordUrl from "./icons/icon_record.png";
import iconIlluminatorUrl from "./icons/icon_illuminator.png";
import iconFlashlightDayNightUrl from "./icons/icon_flashlight_day_night.png";
import iconThermalFusionUrl from "./icons/icon_thermal_fusion.png";
import iconThermalTargetUrl from "./icons/icon_thermal_target.png";
import reticlePrimaryUrl from "./overlays/reticle_primary.png";
import reticleTrackingUrl from "./overlays/reticle_tracking.png";

const productionIconCatalog = {
  menu: {
    exitMenu: "/assets/icons/menu/icon_exit_menu.png",
    exitNevex: "/assets/icons/menu/icon_exit_nevex.png",
    closeMenu: "/assets/icons/menu/icon_close_menu.png",
  },

  settings: {
    quickSettings: "/assets/icons/settings/icon_quick_settings.png",
    settings: "/assets/icons/settings/icon_settings.png",
  },

  system: {
    power: "/assets/icons/system/icon_power.png",
    wifi: "/assets/icons/system/icon_wifi.png",
  },

  detection: {
    targetLock: "/assets/icons/detection/icon_target_lock.png",
    tracking: "/assets/icons/detection/icon_tracking.png",
    animalDetect: "/assets/icons/detection/icon_animal_detect.png",
  },

  navigation: {
    compass: "/assets/icons/navigation/icon_compass.png",
    mapNavigation: "/assets/icons/navigation/icon_map_navigation.png",
  },

  sensors: {
    rangefinder: "/assets/icons/sensors/icon_rangefinder.png",
    calibration: "/assets/icons/sensors/icon_calibration.png",
    scanMode: "/assets/icons/sensors/icon_scan_mode.png",
    irLaser: "/assets/icons/sensors/icon_ir_laser.png",
  },
} as const;

const productionAudioCatalog = {
  ui: {
    click: "/assets/audio/ui/ui_click.wav",
  },

  system: {
    bootStartup: "/assets/audio/system/boot_startup.wav",
  },
} as const;

const placeholderAudioIconCatalog = {
  hearingAmp: "/assets/icons/audio/icon_hearing_amp_placeholder.png",
  audioPassthrough:
    "/assets/icons/audio/icon_audio_passthrough_placeholder.png",
  voiceFocus: "/assets/icons/audio/icon_voice_focus_placeholder.png",
  hearingProtection:
    "/assets/icons/audio/icon_hearing_protection_placeholder.png",
  bluetoothAudio:
    "/assets/icons/audio/icon_bluetooth_audio_placeholder.png",
  musicPlayer: "/assets/icons/audio/icon_music_player_placeholder.png",
  mediaPlay: "/assets/icons/audio/icon_media_play_placeholder.png",
  mediaPause: "/assets/icons/audio/icon_media_pause_placeholder.png",
  mediaNext: "/assets/icons/audio/icon_media_next_placeholder.png",
  mediaPrev: "/assets/icons/audio/icon_media_prev_placeholder.png",
  volume: "/assets/icons/audio/icon_volume_placeholder.png",
} as const;

export const uiAssets = {
  logos: {
    primary: "/src/ui/assets/logos/nevex_logo_primary.png",
    dark: "/src/ui/assets/logos/nevex_logo_dark.png",
  },

  splash: {
    hero: "/src/ui/assets/splash/nevex_splash_hero.png",
    forest: "/src/ui/assets/splash/nevex_splash_forest.png",
    space: "/src/ui/assets/splash/nevex_splash_space.png",
  },

  icons: {
    zoomSlider: "/src/ui/assets/icons/icon_zoom_slider.png",
    exit: "/src/ui/assets/icons/icon_exit.png",
    ai: "/src/ui/assets/icons/icon_ai.png",
    battery: "/src/ui/assets/icons/icon_battery.png",
    dayNight: "/src/ui/assets/icons/icon_day_night.png",
    search: "/src/ui/assets/icons/icon_search.png",
    camera: "/src/ui/assets/icons/icon_camera.png",
    record: "/src/ui/assets/icons/icon_record.png",
    illuminator: "/src/ui/assets/icons/icon_illuminator.png",
    flashlightDayNight:
      "/src/ui/assets/icons/icon_flashlight_day_night.png",
    thermalFusion: "/src/ui/assets/icons/icon_thermal_fusion.png",
    thermalTarget: "/src/ui/assets/icons/icon_thermal_target.png",
  },

  overlays: {
    primaryReticle: "/src/ui/assets/overlays/reticle_primary.png",
    trackingReticle: "/src/ui/assets/overlays/reticle_tracking.png",
  },

  productionIcons: productionIconCatalog,
  audio: productionAudioCatalog,
  placeholderAudioIcons: placeholderAudioIconCatalog,
};

export const uiAssetBrowserUrls = {
  logos: {
    primary: nevexLogoPrimaryUrl,
    dark: nevexLogoDarkUrl,
  },

  splash: {
    hero: nevexSplashHeroUrl,
    forest: nevexSplashForestUrl,
    space: nevexSplashSpaceUrl,
  },

  icons: {
    zoomSlider: iconZoomSliderUrl,
    exit: iconExitUrl,
    ai: iconAiUrl,
    battery: iconBatteryUrl,
    dayNight: iconDayNightUrl,
    search: iconSearchUrl,
    camera: iconCameraUrl,
    record: iconRecordUrl,
    illuminator: iconIlluminatorUrl,
    flashlightDayNight: iconFlashlightDayNightUrl,
    thermalFusion: iconThermalFusionUrl,
    thermalTarget: iconThermalTargetUrl,
  },

  overlays: {
    primaryReticle: reticlePrimaryUrl,
    trackingReticle: reticleTrackingUrl,
  },

  productionIcons: productionIconCatalog,
  audio: productionAudioCatalog,
  placeholderAudioIcons: placeholderAudioIconCatalog,
} as const;
