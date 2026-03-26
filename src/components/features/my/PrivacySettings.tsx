'use client'

import { useState, useTransition } from 'react'
import { updatePrivacySettings } from '@/lib/actions/account'
import { useToast } from '@/components/common/Toast'

interface PrivacySettingsProps {
  isGenderPublic: boolean
  isRegionPublic: boolean
}

export default function PrivacySettings({ isGenderPublic, isRegionPublic }: PrivacySettingsProps) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [gender, setGender] = useState(isGenderPublic)
  const [region, setRegion] = useState(isRegionPublic)

  function handleToggle(field: 'gender' | 'region') {
    const nextGender = field === 'gender' ? !gender : gender
    const nextRegion = field === 'region' ? !region : region

    if (field === 'gender') setGender(nextGender)
    if (field === 'region') setRegion(nextRegion)

    startTransition(async () => {
      const result = await updatePrivacySettings({
        isGenderPublic: nextGender,
        isRegionPublic: nextRegion,
      })
      if (result.error) {
        toast(result.error, 'error')
        // 롤백
        if (field === 'gender') setGender(!nextGender)
        if (field === 'region') setRegion(!nextRegion)
      } else {
        toast('설정이 저장되었어요', 'success')
      }
    })
  }

  return (
    <div className="space-y-3">
      <ToggleRow
        label="성별 공개"
        description="다른 사용자에게 성별이 표시됩니다"
        checked={gender}
        disabled={isPending}
        onToggle={() => handleToggle('gender')}
      />
      <ToggleRow
        label="지역 공개"
        description="다른 사용자에게 지역이 표시됩니다"
        checked={region}
        disabled={isPending}
        onToggle={() => handleToggle('region')}
      />
    </div>
  )
}

function ToggleRow({ label, description, checked, disabled, onToggle }: {
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      className="w-full flex items-center justify-between gap-4 p-4 bg-background rounded-xl min-h-[52px] cursor-pointer transition-colors hover:bg-muted/50 disabled:opacity-50"
      onClick={onToggle}
      disabled={disabled}
    >
      <div className="text-left">
        <div className="text-sm font-bold text-foreground">{label}</div>
        <div className="text-caption text-muted-foreground">{description}</div>
      </div>
      <div
        className={`relative w-[52px] h-[30px] rounded-full shrink-0 transition-colors ${
          checked ? 'bg-primary' : 'bg-border'
        }`}
      >
        <div
          className={`absolute top-[3px] w-[24px] h-[24px] rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[25px]' : 'translate-x-[3px]'
          }`}
        />
      </div>
    </button>
  )
}
