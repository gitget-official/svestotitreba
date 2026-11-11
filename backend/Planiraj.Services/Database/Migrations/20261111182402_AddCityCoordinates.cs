using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Planiraj.Services.Database.Migrations
{
    /// <inheritdoc />
    public partial class AddCityCoordinates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "Latitude",
                table: "Cities",
                type: "float",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "Longitude",
                table: "Cities",
                type: "float",
                nullable: true);

            // Postojeći gradovi dobiju centar po nazivu; ostale administrator može dopuniti u šifarnicima.
            foreach (var (name, lat, lon) in KnownCities)
            {
                migrationBuilder.Sql(
                    $"UPDATE Cities SET Latitude = {lat}, Longitude = {lon} WHERE Name = N'{name}' AND Latitude IS NULL");
            }
        }

        private static readonly (string Name, string Lat, string Lon)[] KnownCities =
        [
            ("Sarajevo", "43.8563", "18.4131"), ("Banja Luka", "44.7722", "17.1910"), ("Tuzla", "44.5384", "18.6763"),
            ("Mostar", "43.3438", "17.8078"), ("Zenica", "44.2034", "17.9077"), ("Bihać", "44.8169", "15.8708"),
            ("Bijeljina", "44.7570", "19.2144"), ("Brčko", "44.8726", "18.8098"), ("Doboj", "44.7349", "18.0843"),
            ("Prijedor", "44.9799", "16.7135"), ("Trebinje", "42.7110", "18.3434"), ("Travnik", "44.2264", "17.6658"),
            ("Cazin", "44.9672", "15.9431"), ("Široki Brijeg", "43.3831", "17.5939"), ("Livno", "43.8269", "17.0075"),
            ("Visoko", "43.9889", "18.1781"), ("Konjic", "43.6519", "17.9617"), ("Gračanica", "44.7031", "18.3097"),
            ("Velika Kladuša", "45.1847", "15.8056"), ("Zvornik", "44.3856", "19.1028"), ("Čapljina", "43.1214", "17.7047"),
            ("Bugojno", "44.0572", "17.4508"), ("Gradiška", "45.1450", "17.2547"), ("Ljubuški", "43.1969", "17.5456"),
            ("Tešanj", "44.6117", "17.9858"), ("Goražde", "43.6669", "18.9761"), ("Jajce", "44.3419", "17.2700"),
            ("Lukavac", "44.5419", "18.5289"), ("Kakanj", "44.1278", "18.1194"), ("Derventa", "44.9775", "17.9081"),
            ("Neum", "42.9233", "17.6156"), ("Srebrenik", "44.7064", "18.4878"), ("Sanski Most", "44.7667", "16.6681"),
            ("Gradačac", "44.8792", "18.4272"), ("Foča", "43.5064", "18.7781"), ("Višegrad", "43.7822", "19.2917"),
            ("Mrkonjić Grad", "44.4172", "17.0833"), ("Drvar", "44.3739", "16.3808"), ("Zavidovići", "44.4458", "18.1497"),
            ("Živinice", "44.4492", "18.6497"), ("Kiseljak", "43.9431", "18.0778"), ("Vitez", "44.1581", "17.7900"),
            ("Novi Travnik", "44.1708", "17.6578"), ("Posušje", "43.4719", "17.3297"), ("Stolac", "43.0844", "17.9575"),
            ("Bosanska Krupa", "44.8825", "16.1517"), ("Modriča", "44.9547", "18.3036"), ("Kalesija", "44.4425", "18.8853"),
            ("Ilidža", "43.8297", "18.3097"), ("Vogošća", "43.9006", "18.3425"), ("Istočno Sarajevo", "43.8219", "18.3608"),
            ("Bileća", "42.8758", "18.4297"), ("Nevesinje", "43.2586", "18.1139"), ("Laktaši", "44.9086", "17.3011"),
            ("Prnjavor", "44.8697", "17.6611"), ("Teslić", "44.6064", "17.8597"), ("Kozarska Dubica", "45.1767", "16.8094"),
            ("Novi Grad", "45.0478", "16.3778"), ("Orašje", "45.0369", "18.6922"), ("Odžak", "45.0111", "18.3256"),
        ];

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Latitude",
                table: "Cities");

            migrationBuilder.DropColumn(
                name: "Longitude",
                table: "Cities");
        }
    }
}
