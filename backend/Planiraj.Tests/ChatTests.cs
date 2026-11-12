using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Planiraj.Model.Dtos;
using Planiraj.Services.Database;

namespace Planiraj.Tests;

/// <summary>Poruke mladenaca i salona (FR-13): ko smije pisati i čitati, nepročitano, stranice i događaji uživo.</summary>
public class ChatTests(ApiFactory api) : IClassFixture<ApiFactory>
{
    private const string Amra = "Studio ljepote Amra";   // vlasnik je seed nalog "salon"
    private const string Panorama = "Sala Panorama";      // bez vlasnika

    private int VendorId(string name)
    {
        using var scope = api.Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<PlanirajDbContext>().Vendors.Single(v => v.Name == name).Id;
    }

    private Task<HttpClient> SalonAsync() => api.LoginAsync("salon", "Salon123!");

    private static async Task<JsonElement> Json(HttpResponseMessage res)
    {
        Assert.True(res.IsSuccessStatusCode, $"{(int)res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
        return await res.Content.ReadFromJsonAsync<JsonElement>();
    }

    private async Task<JsonElement> StartAsync(HttpClient couple, string vendor, string body) =>
        await Json(await couple.PostAsJsonAsync("/api/conversations", new { vendorId = VendorId(vendor), body }));

    private static async Task<JsonElement> ConversationAsync(HttpClient client, int id) =>
        await Json(await client.GetAsync($"/api/conversations/{id}"));

    [Fact]
    public async Task Mladenci_pisu_salonu_salon_odgovara_a_neprocitano_prati_obje_strane()
    {
        var (couple, _) = await api.GoogleAsync("chat-ana");
        var started = await StartAsync(couple, Amra, "  Pozdrav, imate li slobodan termin?  ");
        var id = started.GetProperty("conversation").GetProperty("id").GetInt32();
        Assert.Equal("Pozdrav, imate li slobodan termin?", started.GetProperty("message").GetProperty("body").GetString());
        Assert.False(started.GetProperty("message").GetProperty("fromVendor").GetBoolean());
        Assert.Equal(0, started.GetProperty("conversation").GetProperty("unreadCount").GetInt32());

        var salon = await SalonAsync();
        var inbox = await Json(await salon.GetAsync("/api/conversations"));
        var mine = inbox.GetProperty("items").EnumerateArray().Single(c => c.GetProperty("id").GetInt32() == id);
        Assert.Equal(1, mine.GetProperty("unreadCount").GetInt32());
        Assert.Equal("Test", mine.GetProperty("coupleFirstName").GetString());
        Assert.True(mine.GetProperty("canReply").GetBoolean());
        Assert.True(inbox.GetProperty("unreadTotal").GetInt32() >= 1);
        Assert.EndsWith("Z", mine.GetProperty("lastMessageAt").GetString());   // UTC, preglednik prikazuje lokalno vrijeme

        var reply = await Json(await salon.PostAsJsonAsync($"/api/conversations/{id}/messages", new { body = "Imamo, javite datum." }));
        var replyId = reply.GetProperty("message").GetProperty("id").GetInt32();
        Assert.True(reply.GetProperty("message").GetProperty("fromVendor").GetBoolean());
        // Ko odgovori, vidio je i poruku na koju odgovara.
        Assert.Equal(0, reply.GetProperty("conversation").GetProperty("unreadCount").GetInt32());

        var coupleView = await ConversationAsync(couple, id);
        Assert.Equal(1, coupleView.GetProperty("unreadCount").GetInt32());
        Assert.Equal("Imamo, javite datum.", coupleView.GetProperty("lastMessagePreview").GetString());
        Assert.True(coupleView.GetProperty("lastMessageFromVendor").GetBoolean());
        Assert.Equal(1, (await Json(await couple.GetAsync("/api/conversations"))).GetProperty("unreadTotal").GetInt32());

        var read = await Json(await couple.PutAsync($"/api/conversations/{id}/read", null));
        Assert.Equal(0, read.GetProperty("unreadCount").GetInt32());
        // Salon vidi da su mladenci pročitali njegov odgovor ("Viđeno").
        Assert.Equal(replyId, (await ConversationAsync(salon, id)).GetProperty("otherLastReadMessageId").GetInt32());
    }

    [Fact]
    public async Task Druga_prva_poruka_istom_salonu_nastavlja_isti_razgovor()
    {
        var (couple, _) = await api.GoogleAsync("chat-bojan");
        var first = await StartAsync(couple, Amra, "Prva");
        var second = await StartAsync(couple, Amra, "Druga");
        var id = first.GetProperty("conversation").GetProperty("id").GetInt32();
        Assert.Equal(id, second.GetProperty("conversation").GetProperty("id").GetInt32());

        var withVendor = await Json(await couple.GetAsync($"/api/conversations/vendor/{VendorId(Amra)}"));
        Assert.Equal(id, withVendor.GetProperty("id").GetInt32());
        Assert.Equal(HttpStatusCode.NoContent, (await couple.GetAsync($"/api/conversations/vendor/{VendorId(Panorama)}")).StatusCode);

        var messages = await Json(await couple.GetAsync($"/api/conversations/{id}/messages"));
        Assert.Equal(["Prva", "Druga"], messages.GetProperty("items").EnumerateArray().Select(m => m.GetProperty("body").GetString()));
    }

    [Fact]
    public async Task Salonu_bez_vlasnika_se_ne_moze_pisati_i_ne_nudi_se_u_pretrazi()
    {
        var (couple, _) = await api.GoogleAsync("chat-cana");
        var res = await couple.PostAsJsonAsync("/api/conversations", new { vendorId = VendorId(Panorama), body = "Pozdrav" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);

        var panorama = await Json(await couple.GetAsync($"/api/vendors/{VendorId(Panorama)}"));
        Assert.False(panorama.GetProperty("acceptsMessages").GetBoolean());
        Assert.True((await Json(await couple.GetAsync($"/api/vendors/{VendorId(Amra)}"))).GetProperty("acceptsMessages").GetBoolean());

        var open = await Json(await couple.GetAsync("/api/vendors?acceptsMessages=true&pageSize=100"));
        var names = open.GetProperty("items").EnumerateArray().Select(v => v.GetProperty("name").GetString()).ToList();
        Assert.Contains(Amra, names);
        Assert.DoesNotContain(Panorama, names);
    }

    [Fact]
    public async Task Salon_ne_pise_prvi_a_admin_ne_cita_poruke()
    {
        var salon = await SalonAsync();
        var res = await salon.PostAsJsonAsync("/api/conversations", new { vendorId = VendorId(Amra), body = "Reklama" });
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);

        var admin = await api.LoginAsync("admin", "Admin123!");
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync("/api/conversations")).StatusCode);
    }

    [Fact]
    public async Task Tudji_razgovor_je_nevidljiv()
    {
        var (owner, _) = await api.GoogleAsync("chat-dina");
        var id = (await StartAsync(owner, Amra, "Samo za salon")).GetProperty("conversation").GetProperty("id").GetInt32();

        var (other, _) = await api.GoogleAsync("chat-edin");
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/conversations/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/conversations/{id}/messages")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsJsonAsync($"/api/conversations/{id}/messages", new { body = "Upad" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PutAsync($"/api/conversations/{id}/read", null)).StatusCode);
        Assert.DoesNotContain((await Json(await other.GetAsync("/api/conversations"))).GetProperty("items").EnumerateArray(),
            c => c.GetProperty("id").GetInt32() == id);

        var guest = api.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await guest.GetAsync("/api/conversations")).StatusCode);
    }

    [Fact]
    public async Task Prazna_ili_preduga_poruka_se_odbija()
    {
        var (couple, _) = await api.GoogleAsync("chat-fata");
        Assert.Equal(HttpStatusCode.BadRequest,
            (await couple.PostAsJsonAsync("/api/conversations", new { vendorId = VendorId(Amra), body = "   " })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await couple.PostAsJsonAsync("/api/conversations", new { vendorId = VendorId(Amra), body = new string('a', 2001) })).StatusCode);
    }

    [Fact]
    public async Task Poruke_se_ucitavaju_od_najnovijih_po_stranicama()
    {
        var (couple, _) = await api.GoogleAsync("chat-goran");
        var id = (await StartAsync(couple, Amra, "1")).GetProperty("conversation").GetProperty("id").GetInt32();
        for (var i = 2; i <= 5; i++)
            await Json(await couple.PostAsJsonAsync($"/api/conversations/{id}/messages", new { body = i.ToString() }));

        var last = await Json(await couple.GetAsync($"/api/conversations/{id}/messages?pageSize=2"));
        Assert.Equal(["4", "5"], last.GetProperty("items").EnumerateArray().Select(m => m.GetProperty("body").GetString()));
        Assert.True(last.GetProperty("hasMore").GetBoolean());

        var oldest = last.GetProperty("items")[0].GetProperty("id").GetInt32();
        var earlier = await Json(await couple.GetAsync($"/api/conversations/{id}/messages?pageSize=3&beforeId={oldest}"));
        Assert.Equal(["1", "2", "3"], earlier.GetProperty("items").EnumerateArray().Select(m => m.GetProperty("body").GetString()));
        Assert.False(earlier.GetProperty("hasMore").GetBoolean());
    }

    [Fact]
    public async Task Pretraga_razgovora_po_salonu_ili_mladencima()
    {
        var (couple, _) = await api.GoogleAsync("chat-hana");
        await StartAsync(couple, Amra, "Pozdrav");

        Assert.Equal(1, (await Json(await couple.GetAsync("/api/conversations?fts=Amra"))).GetProperty("totalCount").GetInt32());
        Assert.Equal(0, (await Json(await couple.GetAsync("/api/conversations?fts=Panorama"))).GetProperty("totalCount").GetInt32());

        var salon = await SalonAsync();
        var found = await Json(await salon.GetAsync("/api/conversations?fts=Test Korisnik&pageSize=50"));
        Assert.True(found.GetProperty("totalCount").GetInt32() >= 1);
        Assert.All(found.GetProperty("items").EnumerateArray(), c => Assert.Equal("Test", c.GetProperty("coupleFirstName").GetString()));
    }

    [Fact]
    public async Task Brisanje_profila_brise_razgovore()
    {
        var (couple, _) = await api.GoogleAsync("chat-ivana");
        var id = (await StartAsync(couple, Amra, "Ovo nestaje sa profilom")).GetProperty("conversation").GetProperty("id").GetInt32();

        Assert.Equal(HttpStatusCode.NoContent, (await couple.DeleteAsync("/api/auth/me")).StatusCode);

        var salon = await SalonAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await salon.GetAsync($"/api/conversations/{id}")).StatusCode);
        using var scope = api.Services.CreateScope();
        Assert.False(await scope.ServiceProvider.GetRequiredService<PlanirajDbContext>().ChatMessages.AnyAsync(m => m.ConversationId == id));
    }

    [Fact]
    public async Task Salon_dobija_poruku_uzivo_preko_huba_sa_tokenom_u_adresi()
    {
        var salon = await SalonAsync();
        var token = salon.DefaultRequestHeaders.Authorization!.Parameter!;
        var received = new TaskCompletionSource<ChatSendResultDto>(TaskCreationOptions.RunContinuationsAsynchronously);

        await using var connection = new HubConnectionBuilder()
            .WithUrl(new Uri(api.Server.BaseAddress, "api/hubs/chat"), o =>
            {
                o.Transports = HttpTransportType.WebSockets;
                o.HttpMessageHandlerFactory = _ => api.Server.CreateHandler();
                o.AccessTokenProvider = () => Task.FromResult<string?>(token);
                // Kao u pregledniku: WebSocket nema zaglavlje Authorization, token je u adresi.
                o.WebSocketFactory = async (context, ct) =>
                {
                    var uri = new UriBuilder(context.Uri) { Query = context.Uri.Query.TrimStart('?') + "&access_token=" + token };
                    return await api.Server.CreateWebSocketClient().ConnectAsync(uri.Uri, ct);
                };
            })
            .Build();
        connection.On<ChatSendResultDto>("message", payload => received.TrySetResult(payload));
        await connection.StartAsync();

        var (couple, _) = await api.GoogleAsync("chat-jasmin");
        await StartAsync(couple, Amra, "Stiže li ovo odmah?");

        var payload = await received.Task.WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Equal("Stiže li ovo odmah?", payload.Message.Body);
        // Salon dobija razgovor viđen sa svoje strane: poruka je za njega nepročitana.
        Assert.Equal(1, payload.Conversation.UnreadCount);
        Assert.Equal(Amra, payload.Conversation.VendorName);
    }

    [Fact]
    public async Task Hub_bez_tokena_odbija_vezu()
    {
        await using var connection = new HubConnectionBuilder()
            .WithUrl(new Uri(api.Server.BaseAddress, "api/hubs/chat"), o =>
            {
                o.Transports = HttpTransportType.LongPolling;
                o.HttpMessageHandlerFactory = _ => api.Server.CreateHandler();
            })
            .Build();
        var error = await Assert.ThrowsAsync<HttpRequestException>(() => connection.StartAsync());
        Assert.Equal(HttpStatusCode.Unauthorized, error.StatusCode);
    }
}

/// <summary>E-mail o novoj poruci (FR-15): samo za prvu nepročitanu poruku u razgovoru.</summary>
public class ChatEmailTests(EmailApiFactory api) : IClassFixture<EmailApiFactory>
{
    private List<EmailMessage> Emails(int conversationId)
    {
        using var scope = api.Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<PlanirajDbContext>().EmailMessages.AsNoTracking()
            .Where(m => m.RelatedId == conversationId && m.Type.StartsWith("chat.")).OrderBy(m => m.Id).ToList();
    }

    private int AmraId()
    {
        using var scope = api.Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<PlanirajDbContext>().Vendors.Single(v => v.Name == "Studio ljepote Amra").Id;
    }

    [Fact]
    public async Task Salon_dobija_jedan_email_dok_ne_procita_a_mladenci_kad_salon_odgovori()
    {
        var (couple, _) = await api.GoogleAsync("chat-mail");
        var res = await couple.PostAsJsonAsync("/api/conversations", new { vendorId = AmraId(), body = "<b>Prva</b> poruka & pitanje" });
        res.EnsureSuccessStatusCode();
        var id = (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("conversation").GetProperty("id").GetInt32();
        (await couple.PostAsJsonAsync($"/api/conversations/{id}/messages", new { body = "Druga poruka" })).EnsureSuccessStatusCode();

        var first = Assert.Single(Emails(id));
        Assert.Equal("chat.message.vendor", first.Type);
        Assert.Equal("salon@planiraj.ba", first.ToAddress);
        Assert.Contains("&lt;b&gt;Prva&lt;/b&gt;", first.HtmlBody);                 // tekst poruke ne može ubaciti HTML
        Assert.Contains($"https://planiraj.test/salon/poruke/{id}", first.HtmlBody);
        Assert.Null(first.ReplyTo);                                                     // odgovara se na platformi

        // Salon pročita razgovor: sljedeća poruka mladenaca opet šalje e-mail.
        var salon = await api.LoginAsync("salon", "Salon123!");
        (await salon.PutAsync($"/api/conversations/{id}/read", null)).EnsureSuccessStatusCode();
        (await couple.PostAsJsonAsync($"/api/conversations/{id}/messages", new { body = "Treća" })).EnsureSuccessStatusCode();
        Assert.Equal(2, Emails(id).Count(m => m.Type == "chat.message.vendor"));

        (await salon.PostAsJsonAsync($"/api/conversations/{id}/messages", new { body = "Odgovor salona" })).EnsureSuccessStatusCode();
        var toCouple = Assert.Single(Emails(id), m => m.Type == "chat.message.couple");
        Assert.Equal("chat-mail@gmail.com", toCouple.ToAddress);
        Assert.Contains($"https://planiraj.test/poruke/{id}", toCouple.TextBody);
    }
}
