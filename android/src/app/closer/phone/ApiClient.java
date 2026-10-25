package app.closer.phone;
import org.json.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

public final class ApiClient {
 public static String normalize(String value)throws Exception{
  URI uri=new URI(value.trim());String host=uri.getHost();if(host==null||uri.getUserInfo()!=null||uri.getQuery()!=null||uri.getFragment()!=null||!(uri.getPath()==null||uri.getPath().equals("")||uri.getPath().equals("/")))throw new Exception("Enter the server origin only, for example https://closer.example.com");
  if(!"https".equals(uri.getScheme())&&!("http".equals(uri.getScheme())&&(host.equals("localhost")||host.equals("127.0.0.1")||host.equals("10.0.2.2"))))throw new Exception("Use HTTPS. HTTP is allowed only for a local development server.");
  return value.trim().replaceAll("/+$","");
 }
 public static JSONObject post(String base,String path,String token,JSONObject data)throws Exception{
  HttpURLConnection c=(HttpURLConnection)new URL(base+path).openConnection();try{c.setRequestMethod("POST");c.setInstanceFollowRedirects(false);c.setConnectTimeout(10000);c.setReadTimeout(10000);c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");if(!token.isEmpty())c.setRequestProperty("Authorization","Bearer "+token);
   try(OutputStream stream=c.getOutputStream()){stream.write(data.toString().getBytes(StandardCharsets.UTF_8));}int code=c.getResponseCode();if(code>=300&&code<400)throw new Exception("Server requires browser sign-in. Use the live hosted URL or a self-hosted HTTPS API origin; a private Sites preview cannot receive phone uploads.");
   InputStream input=code>=200&&code<300?c.getInputStream():c.getErrorStream();StringBuilder text=new StringBuilder();if(input!=null)try(BufferedReader reader=new BufferedReader(new InputStreamReader(input,StandardCharsets.UTF_8))){String line;while((line=reader.readLine())!=null){text.append(line);if(text.length()>200000)throw new Exception("Server response is too large");}}
   JSONObject result;try{result=new JSONObject(text.toString());}catch(Exception e){throw new Exception("Server did not return JSON. Check the API URL and access settings.");}
   if(code<200||code>=300)throw new Exception(result.optString("error","Server returned "+code));return result;
  }finally{c.disconnect();}
 }
}
