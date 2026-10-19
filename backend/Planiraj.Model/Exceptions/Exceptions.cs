namespace Planiraj.Model.Exceptions;

/// <summary>Greška u podacima koje je poslao korisnik (HTTP 400).</summary>
public class UserException(string message) : Exception(message) { }

/// <summary>Traženi zapis ne postoji (HTTP 404).</summary>
public class NotFoundException(string message) : Exception(message) { }

/// <summary>Korisnik nema pravo na akciju (HTTP 403).</summary>
public class ForbiddenException(string message) : Exception(message) { }

/// <summary>Konflikt sa postojećim podacima, npr. duplikat ili zauzet termin (HTTP 409).</summary>
public class ConflictException(string message) : Exception(message) { }
