import { isSupabaseConfigured } from "@/lib/supabase/env";

/** Supabase 미설정 시 상단에 표시되는 안내 배너. */
export default function SetupBanner() {
  if (isSupabaseConfigured) return null;
  return (
    <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-800">
      ⚙️ Supabase가 아직 설정되지 않았습니다. 화면 미리보기만 가능합니다 —{" "}
      <code className="font-mono">.env.local</code>에 키를 넣고 dev 서버를 재시작하면
      로그인·기능이 활성화됩니다. (README 참고)
    </div>
  );
}
