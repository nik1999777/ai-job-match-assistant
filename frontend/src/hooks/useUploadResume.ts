import { useParseResumeApiParseResumePost } from '../api/generated'

export function useUploadResume(onSuccess: (text: string, fileId: string | null) => void) {
  return useParseResumeApiParseResumePost({
    mutation: {
      onSuccess: (res) => {
        if (res.status === 200) {
          const data = res.data as { text?: string; file_id?: string }
          onSuccess(data.text ?? '', data.file_id ?? null)
        }
      },
    },
  })
}
