import { useParseResumeApiParseResumePost } from '../api/generated'

export function useUploadResume(onSuccess: (text: string) => void) {
  return useParseResumeApiParseResumePost({
    mutation: {
      onSuccess: (res) => {
        if (res.status === 200) onSuccess(res.data.text ?? '')
      },
    },
  })
}
