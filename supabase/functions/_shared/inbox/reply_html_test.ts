import { assertEquals } from "jsr:@std/assert@1";
import { replyBodyHtml } from "./reply_html.ts";

Deno.test("escapes markup and keeps line breaks", () => {
  assertEquals(
    replyBodyHtml("Hi Jasmine,\r\n\nFriday works <script>x</script> & more.\n— Nelson"),
    "Hi Jasmine,<br><br>Friday works &lt;script&gt;x&lt;/script&gt; &amp; more.<br>— Nelson",
  );
});
Deno.test("quotes are escaped", () => {
  assertEquals(replyBodyHtml(`"a" 'b'`), "&quot;a&quot; &#39;b&#39;");
});

import { studioReplySubject } from "./reply_html.ts";
Deno.test("subject names the project so unrelated replies don't thread together", () => {
  assertEquals(studioReplySubject("Jasmine Reed — Brand Content", "brand_content"), "Nelson at Taylormade · your brand content project");
  assertEquals(studioReplySubject(null, "music_video"), "Nelson at Taylormade · your music video project");
  assertEquals(studioReplySubject(null, "other"), "Nelson at Taylormade · your project");
  assertEquals(studioReplySubject("Dee — Other", "other"), "Nelson at Taylormade · your project");
  assertEquals(studioReplySubject("Marcus T — Headshots", "photography"), "Nelson at Taylormade · your headshots session");
});
