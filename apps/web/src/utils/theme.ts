export type ThemeName = "aurora" | "violet" | "ocean" | "ember"

export const themes: Array<{ label: string; value: ThemeName }> = [
  { label: "深蓝极光", value: "aurora" },
  { label: "渐变紫", value: "violet" },
  { label: "海洋青", value: "ocean" },
  { label: "暖琥珀", value: "ember" },
]

export function isThemeName(value: string | null): value is ThemeName {
  return themes.some((theme) => theme.value === value)
}
