import { IconAddressBook, IconAdjustments, IconAlarm, IconAlertTriangle, IconArmchair, IconArrowBackUp, IconArrowDown, IconArrowForwardUp, IconArrowLeft,
  IconArrowRight, IconArrowUp, IconArrowsExchange2, IconArrowsMaximize, IconArrowsMove, IconBabyCarriage, IconBackspace,
  IconBell, IconBox, IconBuildingStore, IconCalendarEvent, IconCash, IconCashBanknote, IconCashRegister, IconChartBar,
  IconChartLine, IconCheck, IconChecks, IconChefHat, IconChevronDown, IconChevronLeft, IconChevronRight, IconCircleCheck,
  IconCircleCheckFilled, IconClock, IconCopy, IconCreditCard, IconDeviceDesktop, IconDeviceMobile, IconDeviceTablet, IconDots,
  IconDotsVertical, IconFileCheck, IconFileInvoice, IconFileText, IconFileTypePdf, IconFilter, IconFingerprint, IconFlame,
  IconGift, IconHandStop, IconHash, IconHistory, IconInfoCircle, IconKeyboard, IconLanguage, IconLayout2, IconLayoutColumns, IconLayoutDashboard, IconLayoutGrid, IconLoader2,
  IconLock, IconLogout, IconMail, IconMapPin, IconMarquee2, IconMinus, IconPackage, IconPalette, IconPencil, IconPercentage, IconPhone,
  IconPhoto, IconPhotoPlus, IconPlus, IconPointer, IconPrinter, IconProgress, IconQrcode, IconReceipt, IconRefresh, IconRotate, IconSearch,
  IconSettings, IconSettingsCog, IconShoppingBag, IconShoppingCart, IconStack2, IconStairs, IconStar, IconStarFilled, IconTag, IconToolsKitchen2,
  IconTrash, IconTruckDelivery, IconUpload, IconUser, IconUsers, IconVolume, IconVolumeOff, IconSparkles, IconWall, IconWallet, IconX, type IconProps,
} from '@tabler/icons-react'
import type { ComponentType } from 'react'

// Nombres del kit → Tabler Icons (el kit los declara en su página "Icons"). Solo se añaden aquí.
const ICONS = {
  dashboard: IconLayoutDashboard, orders: IconFileText, tables: IconDeviceDesktop, reservations: IconCalendarEvent,
  history: IconHistory, inventory: IconBox, cash: IconCashRegister, kitchen: IconToolsKitchen2, admin: IconAdjustments,
  sales: IconChartBar, catalog: IconPackage, customers: IconAddressBook, billing: IconFileInvoice, settings: IconSettings,
  bell: IconBell, search: IconSearch, plus: IconPlus, minus: IconMinus, close: IconX, check: IconCheck,
  chevronDown: IconChevronDown, chevronLeft: IconChevronLeft, chevronRight: IconChevronRight, arrowLeft: IconArrowLeft,
  arrowRight: IconArrowRight, more: IconDotsVertical, trash: IconTrash, edit: IconPencil, backspace: IconBackspace,
  user: IconUser, users: IconUsers, clock: IconClock, alarm: IconAlarm, printer: IconPrinter, money: IconCash,
  card: IconCreditCard, qr: IconQrcode, receipt: IconReceipt, cart: IconShoppingCart, logout: IconLogout, lock: IconLock,
  photo: IconPhoto, chef: IconChefHat, move: IconArrowsMove, rotate: IconRotate, mail: IconMail, fingerprint: IconFingerprint,
  language: IconLanguage, babyChair: IconBabyCarriage, delivery: IconTruckDelivery, store: IconBuildingStore,
  moreHorizontal: IconDots, refresh: IconRefresh, upload: IconUpload, bag: IconShoppingBag, hash: IconHash,
  expand: IconArrowsMaximize, armchair: IconArmchair, terminal: IconDeviceMobile, banknote: IconCashBanknote,
  mapPin: IconMapPin, phone: IconPhone, loader: IconLoader2, circleCheck: IconCircleCheck, wallet: IconWallet, sparkles: IconSparkles,
  fileCheck: IconFileCheck, progress: IconProgress, exchange: IconArrowsExchange2, photoPlus: IconPhotoPlus,
  cog: IconSettingsCog, info: IconInfoCircle, checkFilled: IconCircleCheckFilled, checks: IconChecks, star: IconStar,
  starFilled: IconStarFilled, volume: IconVolume, volumeOff: IconVolumeOff, flame: IconFlame, tag: IconTag,
  alert: IconAlertTriangle, filter: IconFilter, arrowUp: IconArrowUp, arrowDown: IconArrowDown, gift: IconGift,
  pdf: IconFileTypePdf, palette: IconPalette, layout: IconLayout2, grid: IconLayoutGrid, percentage: IconPercentage,
  chartLine: IconChartLine, tablet: IconDeviceTablet,
  // Editor del plano: herramientas, historial y capas.
  pointer: IconPointer, hand: IconHandStop, wall: IconWall, zone: IconMarquee2, undo: IconArrowBackUp, redo: IconArrowForwardUp,
  copy: IconCopy, layers: IconStack2, keyboard: IconKeyboard,
  // Salón: pisos del local y pantalla partida.
  floors: IconStairs, split: IconLayoutColumns,
} satisfies Record<string, ComponentType<IconProps>>

export type KitIcon = keyof typeof ICONS
export const KIT_ICON_NAMES = Object.keys(ICONS) as KitIcon[]

export function Icon({ name, size = 20, className, label }: { name: KitIcon; size?: number; className?: string; label?: string }) {
  const Cmp = ICONS[name]
  return label
    ? <Cmp size={size} stroke={1.75} className={className} role="img" aria-label={label} />
    : <Cmp size={size} stroke={1.75} className={className} aria-hidden="true" />
}
