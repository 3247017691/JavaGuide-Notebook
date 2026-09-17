#!/usr/bin/env bash

# 本地技能注册表：skills/<文件夹>/SKILL.md
declare -A SKILLS=(
  [new-subapp]="skills/new-subapp/SKILL.md"
  [build-map]="skills/build-map/SKILL.md"
  [headless-verify]="skills/headless-verify/SKILL.md"
  [design-contract]="skills/design-contract/SKILL.md"
)

# 文件夹名 → SKILL.md frontmatter 里的 name
declare -A NAMES=(
  [new-subapp]="workbench-new-subapp"
  [build-map]="workbench-build-map"
  [headless-verify]="workbench-headless-verify"
  [design-contract]="workbench-design-contract"
)

if [[ $# -eq 0 ]]; then
  echo "Usage: source ./skill.sh <folder|install-name>"
  echo "Folders:        ${!SKILLS[*]}"
  echo "Install names:  ${!NAMES[*]}"
else
  key="$1"
  # 允许用安装名反查文件夹名
  for k in "${!NAMES[@]}"; do
    [[ "${NAMES[$k]}" == "$key" ]] && key="$k"
  done
  if [[ -n "${SKILLS[$key]}" ]]; then
    echo "${SKILLS[$key]}"
  else
    echo "没有这个技能：$1" >&2
    exit 1
  fi
fi
