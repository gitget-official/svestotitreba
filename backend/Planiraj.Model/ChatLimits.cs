namespace Planiraj.Model;

/// <summary>Ograničenja poruka, zajednička za validaciju zahtjeva i šemu baze.</summary>
public static class ChatLimits
{
    public const int BodyLength = 2000;
    /// <summary>Početak zadnje poruke u listi razgovora.</summary>
    public const int PreviewLength = 140;
    public const int MaxPageSize = 50;
}
