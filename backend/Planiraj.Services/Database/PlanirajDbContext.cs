using Microsoft.EntityFrameworkCore;
using Planiraj.Model;

namespace Planiraj.Services.Database;

public class PlanirajDbContext(DbContextOptions<PlanirajDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Favorite> Favorites => Set<Favorite>();
    public DbSet<SavedPlan> SavedPlans => Set<SavedPlan>();
    public DbSet<City> Cities => Set<City>();
    public DbSet<ServiceCategory> ServiceCategories => Set<ServiceCategory>();
    public DbSet<SubscriptionPlan> SubscriptionPlans => Set<SubscriptionPlan>();
    public DbSet<Vendor> Vendors => Set<Vendor>();
    public DbSet<VendorOffering> VendorOfferings => Set<VendorOffering>();
    public DbSet<VendorImage> VendorImages => Set<VendorImage>();
    public DbSet<WorkingHour> WorkingHours => Set<WorkingHour>();
    public DbSet<Review> Reviews => Set<Review>();
    public DbSet<Booking> Bookings => Set<Booking>();
    public DbSet<EmailMessage> EmailMessages => Set<EmailMessage>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(e =>
        {
            e.Property(x => x.FirstName).HasMaxLength(100).IsRequired();
            e.Property(x => x.LastName).HasMaxLength(100).IsRequired();
            e.Property(x => x.Email).HasMaxLength(256).IsRequired();
            e.Property(x => x.Username).HasMaxLength(50).IsRequired();
            e.Property(x => x.PhoneNumber).HasMaxLength(30);
            e.Property(x => x.PasswordHash).HasMaxLength(256).IsRequired();
            e.Property(x => x.PasswordSalt).HasMaxLength(256).IsRequired();
            e.Property(x => x.Role).HasConversion<string>().HasMaxLength(20);
            e.HasIndex(x => x.Email).IsUnique();
            e.HasIndex(x => x.Username).IsUnique();
            e.Property(x => x.GoogleId).HasMaxLength(64);
            e.HasIndex(x => x.GoogleId).IsUnique().HasFilter("[GoogleId] IS NOT NULL");
            e.HasOne(x => x.City).WithMany().HasForeignKey(x => x.CityId);
        });

        modelBuilder.Entity<Favorite>(e =>
        {
            e.HasIndex(x => new { x.UserId, x.VendorId }).IsUnique();
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
            e.HasOne(x => x.Vendor).WithMany().HasForeignKey(x => x.VendorId);
        });

        modelBuilder.Entity<SavedPlan>(e =>
        {
            e.HasIndex(x => x.UserId).IsUnique();
            e.Property(x => x.Data).IsRequired();
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
        });

        modelBuilder.Entity<City>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(100).IsRequired();
            e.HasIndex(x => x.Name).IsUnique();
        });

        modelBuilder.Entity<ServiceCategory>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(100).IsRequired();
            e.Property(x => x.Slug).HasMaxLength(120).IsRequired();
            e.Property(x => x.Description).HasMaxLength(1000);
            e.HasIndex(x => x.Name).IsUnique();
            e.HasIndex(x => x.Slug).IsUnique();
        });

        modelBuilder.Entity<SubscriptionPlan>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(100).IsRequired();
            e.Property(x => x.Description).HasMaxLength(1000);
            e.Property(x => x.Price).HasPrecision(10, 2);
        });

        modelBuilder.Entity<Vendor>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(150).IsRequired();
            e.Property(x => x.Slug).HasMaxLength(170).IsRequired();
            e.Property(x => x.Description).HasMaxLength(4000);
            e.Property(x => x.Address).HasMaxLength(250);
            e.Property(x => x.PhoneNumber).HasMaxLength(30);
            e.Property(x => x.Email).HasMaxLength(256);
            e.Property(x => x.Website).HasMaxLength(500);
            e.Property(x => x.InstagramUrl).HasMaxLength(500);
            e.Property(x => x.FacebookUrl).HasMaxLength(500);
            e.Property(x => x.TikTokUrl).HasMaxLength(500);
            e.Property(x => x.LogoUrl).HasMaxLength(500);
            e.Property(x => x.DepositNote).HasMaxLength(500);
            e.HasIndex(x => x.Slug).IsUnique();
            e.HasIndex(x => x.CityId);

            e.HasOne(x => x.City).WithMany(c => c.Vendors).HasForeignKey(x => x.CityId);
            e.HasOne(x => x.Owner).WithMany(u => u.OwnedVendors).HasForeignKey(x => x.OwnerUserId);
            e.HasOne(x => x.SubscriptionPlan).WithMany(p => p.Vendors).HasForeignKey(x => x.SubscriptionPlanId);
        });

        modelBuilder.Entity<VendorOffering>(e =>
        {
            e.Property(x => x.Title).HasMaxLength(150).IsRequired();
            e.Property(x => x.Description).HasMaxLength(2000);
            e.Property(x => x.PriceFrom).HasPrecision(10, 2);
            e.Property(x => x.PriceTo).HasPrecision(10, 2);
            e.Property(x => x.Currency).HasMaxLength(3).IsRequired();
            e.HasOne(x => x.ServiceCategory).WithMany(c => c.Offerings).HasForeignKey(x => x.ServiceCategoryId);
            e.HasIndex(x => new { x.ServiceCategoryId, x.PriceFrom });
        });

        modelBuilder.Entity<VendorImage>(e =>
        {
            e.Property(x => x.Url).HasMaxLength(500).IsRequired();
            e.Property(x => x.Caption).HasMaxLength(200);
        });

        modelBuilder.Entity<WorkingHour>(e =>
        {
            e.HasIndex(x => new { x.VendorId, x.DayOfWeek }).IsUnique();
        });

        modelBuilder.Entity<Review>(e =>
        {
            e.Property(x => x.Comment).HasMaxLength(2000);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.HasOne(x => x.User).WithMany(u => u.Reviews).HasForeignKey(x => x.UserId);
            e.HasOne(x => x.ModeratedBy).WithMany().HasForeignKey(x => x.ModeratedByUserId);
            // Jedna recenzija po korisniku za jednog ponuđača.
            e.HasIndex(x => new { x.VendorId, x.UserId }).IsUnique();
            e.ToTable(t => t.HasCheckConstraint("CK_Reviews_Rating", "[Rating] BETWEEN 1 AND 5"));
        });

        modelBuilder.Entity<Booking>(e =>
        {
            e.Property(x => x.Note).HasMaxLength(1000);
            e.Property(x => x.StatusNote).HasMaxLength(500);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.HasOne(x => x.User).WithMany(u => u.Bookings).HasForeignKey(x => x.UserId);
            e.HasOne(x => x.Offering).WithMany().HasForeignKey(x => x.OfferingId);
            e.HasIndex(x => new { x.VendorId, x.EventDate });
        });

        modelBuilder.Entity<EmailMessage>(e =>
        {
            e.Property(x => x.Type).HasMaxLength(50).IsRequired();
            e.Property(x => x.ToAddress).HasMaxLength(256).IsRequired();
            e.Property(x => x.ToName).HasMaxLength(200);
            e.Property(x => x.ReplyTo).HasMaxLength(256);
            e.Property(x => x.Subject).HasMaxLength(300).IsRequired();
            e.Property(x => x.HtmlBody).IsRequired();
            e.Property(x => x.TextBody).IsRequired();
            e.Property(x => x.AttachmentFileName).HasMaxLength(100);
            e.Property(x => x.AttachmentContentType).HasMaxLength(100);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.SentTo).HasMaxLength(256);
            e.Property(x => x.LastError).HasMaxLength(1000);
            e.HasIndex(x => new { x.Status, x.NextAttemptAt });
        });

        modelBuilder.Entity<Conversation>(e =>
        {
            e.Property(x => x.LastMessagePreview).HasMaxLength(ChatLimits.PreviewLength).IsRequired();
            e.HasOne(x => x.CoupleUser).WithMany().HasForeignKey(x => x.CoupleUserId);
            // Jedan razgovor po paru; liste razgovora se sortiraju po zadnjoj poruci.
            e.HasIndex(x => new { x.VendorId, x.CoupleUserId }).IsUnique();
            e.HasIndex(x => new { x.CoupleUserId, x.LastMessageAt });
            e.HasIndex(x => new { x.VendorId, x.LastMessageAt });
        });

        modelBuilder.Entity<ChatMessage>(e =>
        {
            e.Property(x => x.Body).HasMaxLength(ChatLimits.BodyLength).IsRequired();
            e.HasOne(x => x.Sender).WithMany().HasForeignKey(x => x.SenderUserId);
            e.HasIndex(x => new { x.ConversationId, x.Id });
        });

        // SQL Server ne dozvoljava više kaskadnih putanja, pa je zadano Restrict,
        // a kaskadno brisanje se uključuje samo za "dijelove" ponuđača.
        foreach (var foreignKey in modelBuilder.Model.GetEntityTypes().SelectMany(t => t.GetForeignKeys()))
        {
            foreignKey.DeleteBehavior = DeleteBehavior.Restrict;
        }

        modelBuilder.Entity<VendorOffering>()
            .HasOne(x => x.Vendor).WithMany(v => v.Offerings).HasForeignKey(x => x.VendorId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<VendorImage>()
            .HasOne(x => x.Vendor).WithMany(v => v.Images).HasForeignKey(x => x.VendorId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<WorkingHour>()
            .HasOne(x => x.Vendor).WithMany(v => v.WorkingHours).HasForeignKey(x => x.VendorId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<Review>()
            .HasOne(x => x.Vendor).WithMany(v => v.Reviews).HasForeignKey(x => x.VendorId)
            .OnDelete(DeleteBehavior.Cascade);
        // Sačuvano i plan pripadaju korisniku: brišu se sa njim (i sačuvani ponuđač kad se ponuđač obriše).
        modelBuilder.Entity<Favorite>().HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<Favorite>().HasOne(x => x.Vendor).WithMany().HasForeignKey(x => x.VendorId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<SavedPlan>().HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        // Razgovori su dio stranice ponuđača i brišu se s njom; poruke sa razgovorom. Mladence briše DeleteAccountAsync.
        modelBuilder.Entity<Conversation>()
            .HasOne(x => x.Vendor).WithMany().HasForeignKey(x => x.VendorId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<ChatMessage>()
            .HasOne(x => x.Conversation).WithMany(c => c.Messages).HasForeignKey(x => x.ConversationId)
            .OnDelete(DeleteBehavior.Cascade);
        // Rezervacije ostaju Restrict: ponuđač sa rezervacijama se ne može obrisati (samo deaktivirati).
        modelBuilder.Entity<Booking>()
            .HasOne(x => x.Vendor).WithMany(v => v.Bookings).HasForeignKey(x => x.VendorId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
