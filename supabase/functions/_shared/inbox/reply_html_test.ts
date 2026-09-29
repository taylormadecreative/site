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
